import { Injectable, NotFoundException, ConflictException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Proyecto } from '../entities/proyecto.entity';
import { CreateProyectoDto } from '../dto/create-proyecto.dto';
import { UpdateProyectoDto } from '../dto/update-proyecto.dto';
import { CambiarEstadoProyectoDto } from '../dto/cambiar-estado.dto';
import { ProyectoEstado } from '../enums/proyecto-estado.enum';
import { NotificacionService } from '../../../notificaciones/services/notificacion.service';
import { TipoNotificacion } from '../../../notificaciones/enums/tipo-notificacion.enum';

@Injectable()
export class ProyectoService {
  constructor(
    @InjectRepository(Proyecto)
    private readonly proyectoRepository: Repository<Proyecto>,
    @Inject(forwardRef(() => NotificacionService))
    private readonly notificacionService: NotificacionService,
  ) {}

  async create(createDto: CreateProyectoDto, userId?: number): Promise<Proyecto> {
    const existing = await this.proyectoRepository.findOne({
      where: { codigo: createDto.codigo },
    });

    if (existing) {
      throw new ConflictException(`Ya existe un proyecto con el código ${createDto.codigo}`);
    }

    if (createDto.fechaInicio && createDto.fechaFin) {
      if (new Date(createDto.fechaFin) < new Date(createDto.fechaInicio)) {
        throw new BadRequestException('La fecha de fin debe ser mayor o igual a la fecha de inicio');
      }
    }

    const proyecto = this.proyectoRepository.create({
      ...createDto,
      metodoGestion: 'Scrum',
      createdBy: userId,
      updatedBy: userId,
    });

    const proyectoGuardado = await this.proyectoRepository.save(proyecto);

    // Notificar al coordinador si se le asigna el proyecto
    if (createDto.coordinadorId && createDto.coordinadorId !== userId) {
      await this.notificacionService.notificar(
        TipoNotificacion.PROYECTOS,
        createDto.coordinadorId,
        {
          titulo: `Nuevo proyecto asignado: ${proyectoGuardado.codigo}`,
          descripcion: `Se te ha asignado como Coordinador del proyecto "${proyectoGuardado.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: proyectoGuardado.id,
          proyectoId: proyectoGuardado.id,
          urlAccion: `/poi/proyectos/${proyectoGuardado.id}`,
        },
      );
    }

    // Notificar al Scrum Master si se le asigna
    if (createDto.scrumMasterId && createDto.scrumMasterId !== userId && createDto.scrumMasterId !== createDto.coordinadorId) {
      await this.notificacionService.notificar(
        TipoNotificacion.PROYECTOS,
        createDto.scrumMasterId,
        {
          titulo: `Nuevo proyecto asignado: ${proyectoGuardado.codigo}`,
          descripcion: `Se te ha asignado como Scrum Master del proyecto "${proyectoGuardado.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: proyectoGuardado.id,
          proyectoId: proyectoGuardado.id,
          urlAccion: `/poi/proyectos/${proyectoGuardado.id}`,
        },
      );
    }

    return proyectoGuardado;
  }

  async findAll(filters?: {
    estado?: ProyectoEstado;
    coordinadorId?: number;
    scrumMasterId?: number;
    accionEstrategicaId?: number;
    activo?: boolean;
  }): Promise<Proyecto[]> {
    const queryBuilder = this.proyectoRepository
      .createQueryBuilder('proyecto')
      .leftJoinAndSelect('proyecto.coordinador', 'coordinador')
      .leftJoinAndSelect('proyecto.scrumMaster', 'scrumMaster')
      .orderBy('proyecto.createdAt', 'DESC');

    if (filters?.estado) {
      queryBuilder.andWhere('proyecto.estado = :estado', { estado: filters.estado });
    }

    if (filters?.coordinadorId) {
      queryBuilder.andWhere('proyecto.coordinadorId = :coordinadorId', { coordinadorId: filters.coordinadorId });
    }

    if (filters?.scrumMasterId) {
      queryBuilder.andWhere('proyecto.scrumMasterId = :scrumMasterId', { scrumMasterId: filters.scrumMasterId });
    }

    if (filters?.accionEstrategicaId) {
      queryBuilder.andWhere('proyecto.accionEstrategicaId = :accionEstrategicaId', { accionEstrategicaId: filters.accionEstrategicaId });
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('proyecto.activo = :activo', { activo: filters.activo });
    }

    return queryBuilder.getMany();
  }

  async findOne(id: number): Promise<Proyecto> {
    const proyecto = await this.proyectoRepository.findOne({
      where: { id },
      relations: [
        'coordinador',
        'scrumMaster',
        'patrocinador',
        'accionEstrategica',
        'subproyectos',
      ],
    });

    if (!proyecto) {
      throw new NotFoundException(`Proyecto con ID ${id} no encontrado`);
    }

    return proyecto;
  }

  async findByCodigo(codigo: string): Promise<Proyecto> {
    const proyecto = await this.proyectoRepository.findOne({
      where: { codigo },
      relations: ['coordinador', 'scrumMaster', 'patrocinador'],
    });

    if (!proyecto) {
      throw new NotFoundException(`Proyecto con código ${codigo} no encontrado`);
    }

    return proyecto;
  }

  async update(id: number, updateDto: UpdateProyectoDto, userId?: number): Promise<Proyecto> {
    const proyecto = await this.findOne(id);

    // Capturar valores anteriores para notificaciones
    const coordinadorAnterior = proyecto.coordinadorId;
    const scrumMasterAnterior = proyecto.scrumMasterId;

    if (updateDto.fechaInicio && updateDto.fechaFin) {
      if (new Date(updateDto.fechaFin) < new Date(updateDto.fechaInicio)) {
        throw new BadRequestException('La fecha de fin debe ser mayor o igual a la fecha de inicio');
      }
    }

    // Usar update() del repositorio para evitar problemas con relaciones
    // TypeORM prioriza las relaciones sobre los campos de ID cuando se usa save()
    // Por eso usamos update() que trabaja directamente con los campos
    await this.proyectoRepository.update(id, {
      ...updateDto,
      updatedBy: userId,
    });

    // Recargar el proyecto con las relaciones actualizadas
    const saved = await this.findOne(id);

    // Notificar al nuevo coordinador si cambió
    if (updateDto.coordinadorId && updateDto.coordinadorId !== coordinadorAnterior && updateDto.coordinadorId !== userId) {
      await this.notificacionService.notificar(
        TipoNotificacion.PROYECTOS,
        updateDto.coordinadorId,
        {
          titulo: `Asignado como Coordinador: ${proyecto.codigo}`,
          descripcion: `Se te ha asignado como Coordinador del proyecto "${proyecto.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: proyecto.id,
          proyectoId: proyecto.id,
          urlAccion: `/poi/proyectos/${proyecto.id}`,
        },
      );
    }

    // Notificar al nuevo Scrum Master si cambió
    if (updateDto.scrumMasterId && updateDto.scrumMasterId !== scrumMasterAnterior && updateDto.scrumMasterId !== userId) {
      await this.notificacionService.notificar(
        TipoNotificacion.PROYECTOS,
        updateDto.scrumMasterId,
        {
          titulo: `Asignado como Scrum Master: ${proyecto.codigo}`,
          descripcion: `Se te ha asignado como Scrum Master del proyecto "${proyecto.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: proyecto.id,
          proyectoId: proyecto.id,
          urlAccion: `/poi/proyectos/${proyecto.id}`,
        },
      );
    }

    return saved;
  }

  async cambiarEstado(id: number, cambiarEstadoDto: CambiarEstadoProyectoDto, userId?: number): Promise<Proyecto> {
    const proyecto = await this.findOne(id);
    const estadoAnterior = proyecto.estado;

    // Validar transiciones de estado permitidas
    const transicionesPermitidas: Record<ProyectoEstado, ProyectoEstado[]> = {
      [ProyectoEstado.PENDIENTE]: [ProyectoEstado.EN_PLANIFICACION, ProyectoEstado.CANCELADO],
      [ProyectoEstado.EN_PLANIFICACION]: [ProyectoEstado.EN_DESARROLLO, ProyectoEstado.CANCELADO],
      [ProyectoEstado.EN_DESARROLLO]: [ProyectoEstado.FINALIZADO, ProyectoEstado.CANCELADO],
      [ProyectoEstado.FINALIZADO]: [],
      [ProyectoEstado.CANCELADO]: [],
    };

    if (!transicionesPermitidas[proyecto.estado]?.includes(cambiarEstadoDto.estado)) {
      throw new BadRequestException(
        `No se puede cambiar el estado de ${proyecto.estado} a ${cambiarEstadoDto.estado}`,
      );
    }

    proyecto.estado = cambiarEstadoDto.estado;
    proyecto.updatedBy = userId;
    const proyectoActualizado = await this.proyectoRepository.save(proyecto);

    // Notificar al equipo sobre el cambio de estado
    const destinatarios: number[] = [];
    if (proyecto.coordinadorId && proyecto.coordinadorId !== userId) {
      destinatarios.push(proyecto.coordinadorId);
    }
    if (proyecto.scrumMasterId && proyecto.scrumMasterId !== userId && proyecto.scrumMasterId !== proyecto.coordinadorId) {
      destinatarios.push(proyecto.scrumMasterId);
    }

    if (destinatarios.length > 0) {
      const mensajeEstado = cambiarEstadoDto.estado === ProyectoEstado.FINALIZADO
        ? 'ha sido finalizado'
        : cambiarEstadoDto.estado === ProyectoEstado.CANCELADO
        ? 'ha sido cancelado'
        : `ha cambiado a estado ${cambiarEstadoDto.estado}`;

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        destinatarios,
        {
          titulo: `Estado de proyecto actualizado: ${proyecto.codigo}`,
          descripcion: `El proyecto "${proyecto.nombre}" ${mensajeEstado}`,
          entidadTipo: 'Proyecto',
          entidadId: proyecto.id,
          proyectoId: proyecto.id,
          urlAccion: `/poi/proyectos/${proyecto.id}`,
        },
      );
    }

    return proyectoActualizado;
  }

  async remove(id: number, userId?: number): Promise<Proyecto> {
    const proyecto = await this.findOne(id);
    proyecto.activo = false;
    proyecto.updatedBy = userId;
    return this.proyectoRepository.save(proyecto);
  }

  async findByAccionEstrategica(accionEstrategicaId: number): Promise<Proyecto[]> {
    return this.proyectoRepository.find({
      where: { accionEstrategicaId, activo: true },
      order: { codigo: 'ASC' },
    });
  }
}
