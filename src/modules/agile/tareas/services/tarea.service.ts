import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Tarea, EvidenciaTarea } from '../entities';
import { Subtarea } from '../../subtareas/entities/subtarea.entity';
import { CreateTareaDto } from '../dto/create-tarea.dto';
import { UpdateTareaDto } from '../dto/update-tarea.dto';
import { CambiarEstadoTareaDto } from '../dto/cambiar-estado-tarea.dto';
import { ValidarTareaDto } from '../dto/validar-tarea.dto';
import { CreateEvidenciaTareaDto } from '../dto/create-evidencia-tarea.dto';
import { TareaTipo, TareaEstado, TareaPrioridad } from '../enums/tarea.enum';
import { HistorialCambioService } from '../../common/services/historial-cambio.service';
import { HistorialEntidadTipo, HistorialAccion } from '../../common/enums/historial-cambio.enum';
import { NotificacionService } from '../../../notificaciones/services/notificacion.service';
import { TipoNotificacion } from '../../../notificaciones/enums/tipo-notificacion.enum';

// Configuración de WIP limits por defecto por columna
const DEFAULT_WIP_LIMITS: Record<TareaEstado, number | null> = {
  [TareaEstado.POR_HACER]: null, // Sin límite
  [TareaEstado.EN_PROGRESO]: 5,  // Máximo 5 tareas en progreso
  [TareaEstado.EN_REVISION]: 3,  // Máximo 3 tareas en revisión
  [TareaEstado.FINALIZADO]: null, // Sin límite
};

@Injectable()
export class TareaService {
  constructor(
    @InjectRepository(Tarea)
    private readonly tareaRepository: Repository<Tarea>,
    @InjectRepository(EvidenciaTarea)
    private readonly evidenciaRepository: Repository<EvidenciaTarea>,
    @InjectRepository(Subtarea)
    private readonly subtareaRepository: Repository<Subtarea>,
    private readonly historialCambioService: HistorialCambioService,
    @Inject(forwardRef(() => NotificacionService))
    private readonly notificacionService: NotificacionService,
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

    // Notificar al asignado si se le asigna la tarea
    if (createDto.asignadoA && createDto.asignadoA !== userId) {
      await this.notificacionService.notificar(
        TipoNotificacion.TAREAS,
        createDto.asignadoA,
        {
          titulo: `Nueva tarea asignada: ${tareaGuardada.codigo}`,
          descripcion: `Se te ha asignado la tarea "${tareaGuardada.nombre}"`,
          entidadTipo: 'Tarea',
          entidadId: tareaGuardada.id,
          urlAccion: `/poi/tareas/${tareaGuardada.id}`,
        },
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

    // Notificar si se cambia el asignado
    if (updateDto.asignadoA && updateDto.asignadoA !== valoresAnteriores.asignadoA && updateDto.asignadoA !== userId) {
      await this.notificacionService.notificar(
        TipoNotificacion.TAREAS,
        updateDto.asignadoA,
        {
          titulo: `Tarea asignada: ${tarea.codigo}`,
          descripcion: `Se te ha asignado la tarea "${tarea.nombre}"`,
          entidadTipo: 'Tarea',
          entidadId: tarea.id,
          urlAccion: `/poi/tareas/${tarea.id}`,
        },
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

    // Validar WIP limit antes de mover (solo para tareas KANBAN)
    if (tarea.tipo === TareaTipo.KANBAN && estadoAnterior !== cambiarEstadoDto.estado) {
      await this.validateWipLimit(tarea.actividadId, cambiarEstadoDto.estado, id);
    }

    // Validar subtareas pendientes al finalizar tarea KANBAN
    if (
      cambiarEstadoDto.estado === TareaEstado.FINALIZADO &&
      tarea.tipo === TareaTipo.KANBAN
    ) {
      await this.validateSubtareasPendientes(id);
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

    // Notificar al asignado cuando la tarea cambia de estado
    if (estadoAnterior !== cambiarEstadoDto.estado && tarea.asignadoA && tarea.asignadoA !== userId) {
      const mensajeEstado = cambiarEstadoDto.estado === TareaEstado.FINALIZADO
        ? 'ha sido completada'
        : `ha sido movida a ${cambiarEstadoDto.estado}`;

      await this.notificacionService.notificar(
        TipoNotificacion.TAREAS,
        tarea.asignadoA,
        {
          titulo: `Tarea actualizada: ${tarea.codigo}`,
          descripcion: `La tarea "${tarea.nombre}" ${mensajeEstado}`,
          entidadTipo: 'Tarea',
          entidadId: tarea.id,
          urlAccion: `/poi/tareas/${tarea.id}`,
        },
      );
    }

    // Emitir evento WebSocket para actualizar tableros
    const proyectoId = tarea.historiaUsuario?.proyecto?.id || tarea.actividad?.id;
    if (proyectoId) {
      this.notificacionService.emitTaskUpdate(proyectoId, 'task_status_changed', {
        tareaId: tarea.id,
        codigo: tarea.codigo,
        estadoAnterior,
        estadoNuevo: cambiarEstadoDto.estado,
      });
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
    const estadoAnterior = tarea.estado;

    // Validar WIP limit antes de mover (solo para tareas KANBAN)
    if (tarea.tipo === TareaTipo.KANBAN && estadoAnterior !== estado) {
      await this.validateWipLimit(tarea.actividadId, estado, id);
    }

    // Validar subtareas pendientes al finalizar tarea KANBAN
    if (estado === TareaEstado.FINALIZADO && tarea.tipo === TareaTipo.KANBAN) {
      await this.validateSubtareasPendientes(id);
    }

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

  // ================================================================
  // Métodos de validación Kanban
  // ================================================================

  /**
   * Valida que no se exceda el WIP limit de una columna antes de mover una tarea
   */
  private async validateWipLimit(
    actividadId: number,
    nuevoEstado: TareaEstado,
    tareaId: number,
  ): Promise<void> {
    const wipLimit = this.getWipLimit(nuevoEstado);

    if (wipLimit === null) {
      return; // Sin límite para esta columna
    }

    // Contar tareas activas en el estado destino (excluyendo la tarea que se mueve)
    const tareasEnColumna = await this.tareaRepository.count({
      where: {
        actividadId,
        estado: nuevoEstado,
        activo: true,
        id: Not(tareaId),
      },
    });

    if (tareasEnColumna >= wipLimit) {
      throw new ConflictException(
        `Límite WIP alcanzado en columna "${nuevoEstado}". Máximo ${wipLimit} tareas permitidas.`,
      );
    }
  }

  /**
   * Obtiene el WIP limit para un estado específico
   */
  private getWipLimit(estado: TareaEstado): number | null {
    return DEFAULT_WIP_LIMITS[estado] ?? null;
  }

  /**
   * Cuenta las tareas en un estado específico para una actividad
   */
  async countByEstado(actividadId: number, estado: TareaEstado): Promise<number> {
    return this.tareaRepository.count({
      where: {
        actividadId,
        estado,
        activo: true,
      },
    });
  }

  /**
   * Valida que todas las subtareas de una tarea KANBAN estén finalizadas
   * antes de permitir finalizar la tarea padre
   */
  private async validateSubtareasPendientes(tareaId: number): Promise<void> {
    const pendientes = await this.subtareaRepository.count({
      where: {
        tareaId,
        estado: Not(TareaEstado.FINALIZADO),
        activo: true,
      },
    });

    if (pendientes > 0) {
      throw new BadRequestException(
        `No se puede finalizar la tarea. Hay ${pendientes} subtarea(s) pendiente(s) de completar.`,
      );
    }
  }

  /**
   * Obtiene información de WIP limits para un tablero
   */
  async getWipLimitsInfo(actividadId: number): Promise<{
    estado: TareaEstado;
    limite: number | null;
    actual: number;
  }[]> {
    const estados = Object.values(TareaEstado);
    const result: { estado: TareaEstado; limite: number | null; actual: number }[] = [];

    for (const estado of estados) {
      const actual = await this.countByEstado(actividadId, estado);
      result.push({
        estado,
        limite: this.getWipLimit(estado),
        actual,
      });
    }

    return result;
  }
}
