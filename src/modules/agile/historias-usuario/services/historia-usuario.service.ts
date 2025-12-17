import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { HistoriaUsuario } from '../entities/historia-usuario.entity';
import { CriterioAceptacion } from '../entities/criterio-aceptacion.entity';
import { HuDependencia } from '../entities/hu-dependencia.entity';
import { HuRequerimiento } from '../entities/hu-requerimiento.entity';
import { CreateHistoriaUsuarioDto } from '../dto/create-historia-usuario.dto';
import { UpdateHistoriaUsuarioDto } from '../dto/update-historia-usuario.dto';
import { CambiarEstadoHuDto } from '../dto/cambiar-estado-hu.dto';
import { MoverSprintDto } from '../dto/mover-sprint.dto';
import { AsignarHuDto } from '../dto/asignar-hu.dto';
import { AgregarDependenciaDto } from '../dto/agregar-dependencia.dto';
import { ReordenarBacklogDto } from '../dto/reordenar-backlog.dto';
import { VincularRequerimientoDto } from '../dto/vincular-requerimiento.dto';
import { HuPrioridad, HuEstado } from '../enums/historia-usuario.enum';
import { HistorialCambioService } from '../../common/services/historial-cambio.service';
import { HistorialEntidadTipo, HistorialAccion } from '../../common/enums/historial-cambio.enum';

@Injectable()
export class HistoriaUsuarioService {
  constructor(
    @InjectRepository(HistoriaUsuario)
    private readonly huRepository: Repository<HistoriaUsuario>,
    @InjectRepository(CriterioAceptacion)
    private readonly criterioRepository: Repository<CriterioAceptacion>,
    @InjectRepository(HuDependencia)
    private readonly dependenciaRepository: Repository<HuDependencia>,
    @InjectRepository(HuRequerimiento)
    private readonly huRequerimientoRepository: Repository<HuRequerimiento>,
    private readonly historialCambioService: HistorialCambioService,
  ) {}

  async create(createDto: CreateHistoriaUsuarioDto, userId?: number): Promise<HistoriaUsuario> {
    const existing = await this.huRepository.findOne({
      where: { proyectoId: createDto.proyectoId, codigo: createDto.codigo },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una HU con el código ${createDto.codigo} en este proyecto`,
      );
    }

    const { criteriosAceptacion, ...huData } = createDto;

    const hu = this.huRepository.create({
      ...huData,
      createdBy: userId,
      updatedBy: userId,
    });

    const savedHu = await this.huRepository.save(hu);

    // Create criterios de aceptación if provided
    if (criteriosAceptacion && criteriosAceptacion.length > 0) {
      const criterios = criteriosAceptacion.map((c, index) =>
        this.criterioRepository.create({
          ...c,
          historiaUsuarioId: savedHu.id,
          orden: c.orden ?? index + 1,
        }),
      );
      await this.criterioRepository.save(criterios);
    }

    // Registrar creacion en historial
    if (userId) {
      await this.historialCambioService.registrarCreacion(
        HistorialEntidadTipo.HISTORIA_USUARIO,
        savedHu.id,
        userId,
        { codigo: savedHu.codigo, titulo: savedHu.titulo },
      );
    }

    return this.findOne(savedHu.id);
  }

  async findAll(filters?: {
    proyectoId?: number;
    epicaId?: number;
    sprintId?: number;
    estado?: HuEstado;
    prioridad?: HuPrioridad;
    asignadoA?: number;
    enBacklog?: boolean;
    activo?: boolean;
  }): Promise<HistoriaUsuario[]> {
    const queryBuilder = this.huRepository
      .createQueryBuilder('hu')
      .leftJoinAndSelect('hu.epica', 'epica')
      .leftJoinAndSelect('hu.sprint', 'sprint')
      .leftJoinAndSelect('hu.asignado', 'asignado')
      .orderBy('hu.ordenBacklog', 'ASC')
      .addOrderBy('hu.prioridad', 'ASC')
      .addOrderBy('hu.createdAt', 'DESC');

    if (filters?.proyectoId) {
      queryBuilder.andWhere('hu.proyectoId = :proyectoId', {
        proyectoId: filters.proyectoId,
      });
    }

    if (filters?.epicaId) {
      queryBuilder.andWhere('hu.epicaId = :epicaId', { epicaId: filters.epicaId });
    }

    if (filters?.sprintId) {
      queryBuilder.andWhere('hu.sprintId = :sprintId', { sprintId: filters.sprintId });
    }

    if (filters?.estado) {
      queryBuilder.andWhere('hu.estado = :estado', { estado: filters.estado });
    }

    if (filters?.prioridad) {
      queryBuilder.andWhere('hu.prioridad = :prioridad', { prioridad: filters.prioridad });
    }

    if (filters?.asignadoA) {
      queryBuilder.andWhere('hu.asignadoA = :asignadoA', { asignadoA: filters.asignadoA });
    }

    if (filters?.enBacklog === true) {
      queryBuilder.andWhere('hu.sprintId IS NULL');
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('hu.activo = :activo', { activo: filters.activo });
    }

    return queryBuilder.getMany();
  }

  async findByProyecto(proyectoId: number): Promise<HistoriaUsuario[]> {
    return this.huRepository.find({
      where: { proyectoId, activo: true },
      relations: ['epica', 'sprint', 'asignado'],
      order: { ordenBacklog: 'ASC', prioridad: 'ASC' },
    });
  }

  async findBySprint(sprintId: number): Promise<HistoriaUsuario[]> {
    return this.huRepository.find({
      where: { sprintId, activo: true },
      relations: ['epica', 'asignado'],
      order: { prioridad: 'ASC', ordenBacklog: 'ASC' },
    });
  }

  async findByEpica(epicaId: number): Promise<HistoriaUsuario[]> {
    return this.huRepository.find({
      where: { epicaId, activo: true },
      relations: ['sprint', 'asignado'],
      order: { prioridad: 'ASC', ordenBacklog: 'ASC' },
    });
  }

  async findOne(id: number): Promise<HistoriaUsuario> {
    const hu = await this.huRepository
      .createQueryBuilder('hu')
      .leftJoinAndSelect('hu.proyecto', 'proyecto')
      .leftJoinAndSelect('hu.epica', 'epica')
      .leftJoinAndSelect('hu.sprint', 'sprint')
      .leftJoinAndSelect('hu.asignado', 'asignado')
      .leftJoinAndSelect('hu.criteriosAceptacion', 'criterios', 'criterios.activo = :activo', { activo: true })
      .leftJoinAndSelect('hu.dependencias', 'dependencias')
      .leftJoinAndSelect('dependencias.dependeDe', 'dependeDe')
      .where('hu.id = :id', { id })
      .getOne();

    if (!hu) {
      throw new NotFoundException(`Historia de Usuario con ID ${id} no encontrada`);
    }

    return hu;
  }

  async update(
    id: number,
    updateDto: UpdateHistoriaUsuarioDto,
    userId?: number,
  ): Promise<HistoriaUsuario> {
    const hu = await this.findOne(id);

    // Clonar valores anteriores para comparacion
    const valoresAnteriores = {
      titulo: hu.titulo,
      rol: hu.rol,
      quiero: hu.quiero,
      para: hu.para,
      estado: hu.estado,
      prioridad: hu.prioridad,
      storyPoints: hu.storyPoints,
      epicaId: hu.epicaId,
      sprintId: hu.sprintId,
      asignadoA: hu.asignadoA,
      ordenBacklog: hu.ordenBacklog,
    };

    const { criteriosAceptacion, ...huData } = updateDto;

    Object.assign(hu, huData, { updatedBy: userId });

    await this.huRepository.save(hu);

    // Update criterios if provided
    if (criteriosAceptacion !== undefined) {
      // Remove existing criterios
      await this.criterioRepository.delete({ historiaUsuarioId: id });

      // Create new criterios
      if (criteriosAceptacion.length > 0) {
        const criterios = criteriosAceptacion.map((c, index) =>
          this.criterioRepository.create({
            ...c,
            historiaUsuarioId: id,
            orden: c.orden ?? index + 1,
          }),
        );
        await this.criterioRepository.save(criterios);
      }
    }

    // Registrar cambios en historial
    if (userId) {
      await this.historialCambioService.registrarCambiosMultiples(
        HistorialEntidadTipo.HISTORIA_USUARIO,
        id,
        valoresAnteriores,
        huData,
        userId,
      );
    }

    return this.findOne(id);
  }

  async cambiarEstado(
    id: number,
    cambiarEstadoDto: CambiarEstadoHuDto,
    userId?: number,
  ): Promise<HistoriaUsuario> {
    const hu = await this.findOne(id);
    const estadoAnterior = hu.estado;

    hu.estado = cambiarEstadoDto.estado;
    hu.updatedBy = userId;

    const huActualizada = await this.huRepository.save(hu);

    // Registrar cambio de estado en historial
    if (userId && estadoAnterior !== cambiarEstadoDto.estado) {
      await this.historialCambioService.registrarCambioEstado(
        HistorialEntidadTipo.HISTORIA_USUARIO,
        id,
        estadoAnterior,
        cambiarEstadoDto.estado,
        userId,
      );
    }

    return huActualizada;
  }

  async moverASprint(
    id: number,
    moverDto: MoverSprintDto,
    userId?: number,
  ): Promise<HistoriaUsuario> {
    const hu = await this.findOne(id);
    const sprintAnterior = hu.sprintId;

    hu.sprintId = moverDto.sprintId || null;
    hu.updatedBy = userId;

    const huActualizada = await this.huRepository.save(hu);

    // Registrar movimiento en historial
    if (userId && sprintAnterior !== hu.sprintId) {
      await this.historialCambioService.registrarMovimiento(
        HistorialEntidadTipo.HISTORIA_USUARIO,
        id,
        'sprintId',
        sprintAnterior,
        hu.sprintId,
        userId,
      );
    }

    return huActualizada;
  }

  async asignar(id: number, asignarDto: AsignarHuDto, userId?: number): Promise<HistoriaUsuario> {
    const hu = await this.findOne(id);
    const asignadoAnterior = hu.asignadoA;

    hu.asignadoA = asignarDto.asignadoA || null;
    hu.updatedBy = userId;

    const huActualizada = await this.huRepository.save(hu);

    // Registrar asignacion en historial
    if (userId && asignadoAnterior !== hu.asignadoA) {
      await this.historialCambioService.registrarAsignacion(
        HistorialEntidadTipo.HISTORIA_USUARIO,
        id,
        asignadoAnterior,
        hu.asignadoA,
        userId,
      );
    }

    return huActualizada;
  }

  async agregarDependencia(
    id: number,
    agregarDto: AgregarDependenciaDto,
    userId?: number,
  ): Promise<HuDependencia> {
    const hu = await this.findOne(id);

    // Check that dependeDe exists
    const dependeDe = await this.huRepository.findOne({
      where: { id: agregarDto.dependeDeId, activo: true },
    });

    if (!dependeDe) {
      throw new NotFoundException(
        `Historia de Usuario con ID ${agregarDto.dependeDeId} no encontrada`,
      );
    }

    // Check no self-reference
    if (id === agregarDto.dependeDeId) {
      throw new BadRequestException('Una HU no puede depender de sí misma');
    }

    // Check no duplicate
    const existing = await this.dependenciaRepository.findOne({
      where: {
        historiaUsuarioId: id,
        dependeDeId: agregarDto.dependeDeId,
      },
    });

    if (existing) {
      throw new ConflictException('Esta dependencia ya existe');
    }

    const dependencia = this.dependenciaRepository.create({
      historiaUsuarioId: id,
      dependeDeId: agregarDto.dependeDeId,
      tipoDependencia: agregarDto.tipoDependencia,
      notas: agregarDto.notas,
    });

    return this.dependenciaRepository.save(dependencia);
  }

  async eliminarDependencia(id: number, dependenciaId: number): Promise<void> {
    const dependencia = await this.dependenciaRepository.findOne({
      where: { id: dependenciaId, historiaUsuarioId: id },
    });

    if (!dependencia) {
      throw new NotFoundException(`Dependencia con ID ${dependenciaId} no encontrada`);
    }

    await this.dependenciaRepository.remove(dependencia);
  }

  async reordenarBacklog(
    proyectoId: number,
    reordenarDto: ReordenarBacklogDto,
    userId?: number,
  ): Promise<void> {
    for (const item of reordenarDto.orden) {
      await this.huRepository.update(
        { id: item.huId, proyectoId },
        { ordenBacklog: item.ordenBacklog, updatedBy: userId },
      );
    }
  }

  async getBacklog(proyectoId: number): Promise<any> {
    const hus = await this.huRepository.find({
      where: { proyectoId, activo: true },
      relations: ['epica', 'sprint'],
      order: { ordenBacklog: 'ASC', prioridad: 'ASC' },
    });

    const backlog = hus.filter((hu) => !hu.sprintId);
    const husEnSprints = hus.filter((hu) => hu.sprintId);

    // Group by sprint
    const sprintMap = new Map();
    for (const hu of husEnSprints) {
      if (!sprintMap.has(hu.sprintId)) {
        sprintMap.set(hu.sprintId, {
          id: hu.sprint.id,
          nombre: hu.sprint.nombre,
          estado: hu.sprint.estado,
          fechaInicio: hu.sprint.fechaInicio,
          fechaFin: hu.sprint.fechaFin,
          storyPoints: 0,
          historias: [],
        });
      }
      const sprint = sprintMap.get(hu.sprintId);
      sprint.historias.push(hu);
      sprint.storyPoints += hu.storyPoints || 0;
    }

    // Get unique epicas
    const epicasMap = new Map();
    for (const hu of hus) {
      if (hu.epica && !epicasMap.has(hu.epicaId)) {
        epicasMap.set(hu.epicaId, {
          id: hu.epica.id,
          codigo: hu.epica.codigo,
          nombre: hu.epica.nombre,
          color: hu.epica.color,
        });
      }
    }

    const totalStoryPoints = hus.reduce((sum, hu) => sum + (hu.storyPoints || 0), 0);

    return {
      epicas: Array.from(epicasMap.values()),
      sprints: Array.from(sprintMap.values()),
      backlog,
      metricas: {
        totalHUs: hus.length,
        husEnBacklog: backlog.length,
        husEnSprints: husEnSprints.length,
        totalStoryPoints,
      },
    };
  }

  async remove(id: number, userId?: number): Promise<HistoriaUsuario> {
    const hu = await this.findOne(id);
    hu.activo = false;
    hu.updatedBy = userId;

    const huEliminada = await this.huRepository.save(hu);

    // Registrar eliminacion en historial
    if (userId) {
      await this.historialCambioService.registrarEliminacion(
        HistorialEntidadTipo.HISTORIA_USUARIO,
        id,
        userId,
      );
    }

    return huEliminada;
  }

  async vincularRequerimiento(
    id: number,
    vincularDto: VincularRequerimientoDto,
    userId?: number,
  ): Promise<HuRequerimiento> {
    // Verify Historia de Usuario exists
    const hu = await this.huRepository.findOne({
      where: { id, activo: true },
    });

    if (!hu) {
      throw new NotFoundException(`Historia de Usuario con ID ${id} no encontrada`);
    }

    // Check for duplicate
    const existing = await this.huRequerimientoRepository.findOne({
      where: {
        historiaUsuarioId: id,
        requerimientoId: vincularDto.requerimientoId,
      },
    });

    if (existing) {
      throw new ConflictException('Este requerimiento ya está vinculado a esta Historia de Usuario');
    }

    const huRequerimiento = this.huRequerimientoRepository.create({
      historiaUsuarioId: id,
      requerimientoId: vincularDto.requerimientoId,
      notas: vincularDto.notas,
    });

    return this.huRequerimientoRepository.save(huRequerimiento);
  }

  async obtenerRequerimientos(id: number): Promise<HuRequerimiento[]> {
    // Verify Historia de Usuario exists
    const hu = await this.huRepository.findOne({
      where: { id, activo: true },
    });

    if (!hu) {
      throw new NotFoundException(`Historia de Usuario con ID ${id} no encontrada`);
    }

    return this.huRequerimientoRepository.find({
      where: { historiaUsuarioId: id },
      relations: ['requerimiento'],
      order: { createdAt: 'DESC' },
    });
  }

  async desvincularRequerimiento(id: number, requerimientoId: number): Promise<void> {
    const huRequerimiento = await this.huRequerimientoRepository.findOne({
      where: { historiaUsuarioId: id, requerimientoId },
    });

    if (!huRequerimiento) {
      throw new NotFoundException('Vinculación no encontrada');
    }

    await this.huRequerimientoRepository.remove(huRequerimiento);
  }
}
