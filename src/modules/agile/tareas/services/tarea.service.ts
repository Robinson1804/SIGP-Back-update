import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tarea, EvidenciaTarea } from '../entities';
import { CreateTareaDto } from '../dto/create-tarea.dto';
import { UpdateTareaDto } from '../dto/update-tarea.dto';
import { CambiarEstadoTareaDto } from '../dto/cambiar-estado-tarea.dto';
import { ValidarTareaDto } from '../dto/validar-tarea.dto';
import { CreateEvidenciaTareaDto } from '../dto/create-evidencia-tarea.dto';
import { TareaTipo, TareaEstado, TareaPrioridad } from '../enums/tarea.enum';
import { HistorialCambioService } from '../../common/services/historial-cambio.service';
import { HistorialEntidadTipo, HistorialAccion } from '../../common/enums/historial-cambio.enum';

@Injectable()
export class TareaService {
  constructor(
    @InjectRepository(Tarea)
    private readonly tareaRepository: Repository<Tarea>,
    @InjectRepository(EvidenciaTarea)
    private readonly evidenciaRepository: Repository<EvidenciaTarea>,
    private readonly historialCambioService: HistorialCambioService,
  ) {}

  async create(createDto: CreateTareaDto, userId?: number): Promise<Tarea> {
    // Validate that either historiaUsuarioId or actividadId is provided based on type
    if (createDto.tipo === TareaTipo.SCRUM && !createDto.historiaUsuarioId) {
      throw new BadRequestException('historiaUsuarioId es requerido para tareas SCRUM');
    }
    if (createDto.tipo === TareaTipo.KANBAN && !createDto.actividadId) {
      throw new BadRequestException('actividadId es requerido para tareas KANBAN');
    }

    // Check for duplicate code
    const whereCondition = createDto.tipo === TareaTipo.SCRUM
      ? { historiaUsuarioId: createDto.historiaUsuarioId, codigo: createDto.codigo }
      : { actividadId: createDto.actividadId, codigo: createDto.codigo };

    const existing = await this.tareaRepository.findOne({ where: whereCondition });

    if (existing) {
      throw new ConflictException(`Ya existe una tarea con el código ${createDto.codigo}`);
    }

    const tarea = this.tareaRepository.create({
      ...createDto,
      createdBy: userId,
      updatedBy: userId,
    });

    const tareaGuardada = await this.tareaRepository.save(tarea);

    // Registrar creacion en historial
    if (userId) {
      await this.historialCambioService.registrarCreacion(
        HistorialEntidadTipo.TAREA,
        tareaGuardada.id,
        userId,
        { codigo: tareaGuardada.codigo, nombre: tareaGuardada.nombre },
      );
    }

    return tareaGuardada;
  }

  async findAll(filters?: {
    tipo?: TareaTipo;
    historiaUsuarioId?: number;
    actividadId?: number;
    estado?: TareaEstado;
    prioridad?: TareaPrioridad;
    asignadoA?: number;
    activo?: boolean;
  }): Promise<Tarea[]> {
    const queryBuilder = this.tareaRepository
      .createQueryBuilder('tarea')
      .leftJoinAndSelect('tarea.asignado', 'asignado')
      .orderBy('tarea.prioridad', 'ASC')
      .addOrderBy('tarea.createdAt', 'DESC');

    if (filters?.tipo) {
      queryBuilder.andWhere('tarea.tipo = :tipo', { tipo: filters.tipo });
    }

    if (filters?.historiaUsuarioId) {
      queryBuilder.andWhere('tarea.historiaUsuarioId = :historiaUsuarioId', {
        historiaUsuarioId: filters.historiaUsuarioId,
      });
    }

    if (filters?.actividadId) {
      queryBuilder.andWhere('tarea.actividadId = :actividadId', {
        actividadId: filters.actividadId,
      });
    }

    if (filters?.estado) {
      queryBuilder.andWhere('tarea.estado = :estado', { estado: filters.estado });
    }

    if (filters?.prioridad) {
      queryBuilder.andWhere('tarea.prioridad = :prioridad', { prioridad: filters.prioridad });
    }

    if (filters?.asignadoA) {
      queryBuilder.andWhere('tarea.asignadoA = :asignadoA', { asignadoA: filters.asignadoA });
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('tarea.activo = :activo', { activo: filters.activo });
    }

    return queryBuilder.getMany();
  }

  async findByHistoriaUsuario(historiaUsuarioId: number): Promise<Tarea[]> {
    return this.tareaRepository.find({
      where: { historiaUsuarioId, activo: true },
      relations: ['asignado'],
      order: { prioridad: 'ASC', createdAt: 'DESC' },
    });
  }

  async findByActividad(actividadId: number): Promise<Tarea[]> {
    return this.tareaRepository.find({
      where: { actividadId, activo: true },
      relations: ['asignado'],
      order: { prioridad: 'ASC', createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Tarea> {
    const tarea = await this.tareaRepository.findOne({
      where: { id },
      relations: ['historiaUsuario', 'actividad', 'asignado', 'validador'],
    });

    if (!tarea) {
      throw new NotFoundException(`Tarea con ID ${id} no encontrada`);
    }

    return tarea;
  }

  async update(id: number, updateDto: UpdateTareaDto, userId?: number): Promise<Tarea> {
    const tarea = await this.findOne(id);

    // Clonar valores anteriores para comparacion
    const valoresAnteriores = {
      nombre: tarea.nombre,
      descripcion: tarea.descripcion,
      estado: tarea.estado,
      prioridad: tarea.prioridad,
      horasEstimadas: tarea.horasEstimadas,
      horasReales: tarea.horasReales,
      asignadoA: tarea.asignadoA,
    };

    Object.assign(tarea, updateDto, { updatedBy: userId });

    const tareaActualizada = await this.tareaRepository.save(tarea);

    // Registrar cambios en historial
    if (userId) {
      await this.historialCambioService.registrarCambiosMultiples(
        HistorialEntidadTipo.TAREA,
        id,
        valoresAnteriores,
        updateDto,
        userId,
      );
    }

    return tareaActualizada;
  }

  async cambiarEstado(
    id: number,
    cambiarEstadoDto: CambiarEstadoTareaDto,
    userId?: number,
  ): Promise<Tarea> {
    const tarea = await this.findOne(id);
    const estadoAnterior = tarea.estado;

    // If finalizing, require evidenciaUrl for SCRUM tasks
    if (
      cambiarEstadoDto.estado === TareaEstado.FINALIZADO &&
      tarea.tipo === TareaTipo.SCRUM &&
      !cambiarEstadoDto.evidenciaUrl &&
      !tarea.evidenciaUrl
    ) {
      throw new BadRequestException(
        'Se requiere evidencia para finalizar una tarea SCRUM',
      );
    }

    tarea.estado = cambiarEstadoDto.estado;
    tarea.updatedBy = userId;

    if (cambiarEstadoDto.horasReales !== undefined) {
      tarea.horasReales = cambiarEstadoDto.horasReales;
    }

    if (cambiarEstadoDto.evidenciaUrl) {
      tarea.evidenciaUrl = cambiarEstadoDto.evidenciaUrl;
    }

    const tareaActualizada = await this.tareaRepository.save(tarea);

    // Registrar cambio de estado en historial
    if (userId && estadoAnterior !== cambiarEstadoDto.estado) {
      await this.historialCambioService.registrarCambioEstado(
        HistorialEntidadTipo.TAREA,
        id,
        estadoAnterior,
        cambiarEstadoDto.estado,
        userId,
      );
    }

    return tareaActualizada;
  }

  async validar(id: number, validarDto: ValidarTareaDto, userId: number): Promise<Tarea> {
    const tarea = await this.findOne(id);

    if (tarea.estado !== TareaEstado.FINALIZADO) {
      throw new BadRequestException('Solo se pueden validar tareas finalizadas');
    }

    const validadaAnterior = tarea.validada;

    tarea.validada = validarDto.validada;
    tarea.validadaPor = userId;
    tarea.fechaValidacion = new Date();
    tarea.updatedBy = userId;

    if (validarDto.observacion) {
      tarea.observaciones = validarDto.observacion;
    }

    const tareaValidada = await this.tareaRepository.save(tarea);

    // Registrar validacion en historial
    await this.historialCambioService.registrarCambio({
      entidadTipo: HistorialEntidadTipo.TAREA,
      entidadId: id,
      accion: HistorialAccion.VALIDACION,
      campoModificado: 'validada',
      valorAnterior: validadaAnterior,
      valorNuevo: validarDto.validada,
      usuarioId: userId,
    });

    return tareaValidada;
  }

  async mover(id: number, estado: TareaEstado, userId?: number): Promise<Tarea> {
    const tarea = await this.findOne(id);

    tarea.estado = estado;
    tarea.updatedBy = userId;

    return this.tareaRepository.save(tarea);
  }

  async remove(id: number, userId?: number): Promise<Tarea> {
    const tarea = await this.findOne(id);
    tarea.activo = false;
    tarea.updatedBy = userId;

    const tareaEliminada = await this.tareaRepository.save(tarea);

    // Registrar eliminacion en historial
    if (userId) {
      await this.historialCambioService.registrarEliminacion(
        HistorialEntidadTipo.TAREA,
        id,
        userId,
      );
    }

    return tareaEliminada;
  }

  // ================================================================
  // Métodos de Evidencias
  // ================================================================

  async agregarEvidencia(
    tareaId: number,
    createDto: CreateEvidenciaTareaDto,
    userId: number,
  ): Promise<EvidenciaTarea> {
    // Verificar que la tarea existe
    const tarea = await this.findOne(tareaId);

    const evidencia = this.evidenciaRepository.create({
      ...createDto,
      tareaId,
      subidoPor: userId,
    });

    const evidenciaCreada = await this.evidenciaRepository.save(evidencia);

    // Registrar en historial
    await this.historialCambioService.registrarCambio({
      entidadTipo: HistorialEntidadTipo.TAREA,
      entidadId: tareaId,
      accion: HistorialAccion.ACTUALIZACION,
      usuarioId: userId,
      campoModificado: 'evidencia',
      valorNuevo: createDto.nombre,
    });

    return evidenciaCreada;
  }

  async obtenerEvidencias(tareaId: number): Promise<EvidenciaTarea[]> {
    // Verificar que la tarea existe
    await this.findOne(tareaId);

    return this.evidenciaRepository.find({
      where: { tareaId },
      relations: ['usuario'],
      order: { createdAt: 'DESC' },
    });
  }

  async eliminarEvidencia(
    tareaId: number,
    evidenciaId: number,
    userId: number,
  ): Promise<void> {
    // Verificar que la tarea existe
    await this.findOne(tareaId);

    const evidencia = await this.evidenciaRepository.findOne({
      where: { id: evidenciaId, tareaId },
    });

    if (!evidencia) {
      throw new NotFoundException(`Evidencia con ID ${evidenciaId} no encontrada`);
    }

    await this.evidenciaRepository.remove(evidencia);

    // Registrar en historial
    await this.historialCambioService.registrarCambio({
      entidadTipo: HistorialEntidadTipo.TAREA,
      entidadId: tareaId,
      accion: HistorialAccion.ACTUALIZACION,
      usuarioId: userId,
      campoModificado: 'evidencia',
      valorAnterior: evidencia.nombre,
    });
  }
}
