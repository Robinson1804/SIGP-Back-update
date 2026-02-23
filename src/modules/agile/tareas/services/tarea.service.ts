import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, Not, In } from 'typeorm';
import { Tarea, EvidenciaTarea, TareaAsignado } from '../entities';
import { Subtarea } from '../../subtareas/entities/subtarea.entity';
import { HistoriaUsuario } from '../../historias-usuario/entities/historia-usuario.entity';
import { Sprint } from '../../sprints/entities/sprint.entity';
import { SprintEstado } from '../../sprints/enums/sprint.enum';
import { Proyecto } from '../../../poi/proyectos/entities/proyecto.entity';
import { Subproyecto } from '../../../poi/subproyectos/entities/subproyecto.entity';
import { Actividad } from '../../../poi/actividades/entities/actividad.entity';
import { Usuario } from '../../../auth/entities/usuario.entity';
import { Personal } from '../../../rrhh/personal/entities/personal.entity';
import { CreateTareaDto } from '../dto/create-tarea.dto';
import { UpdateTareaDto } from '../dto/update-tarea.dto';
import { CambiarEstadoTareaDto } from '../dto/cambiar-estado-tarea.dto';
import { ValidarTareaDto } from '../dto/validar-tarea.dto';
import { CreateEvidenciaTareaDto } from '../dto/create-evidencia-tarea.dto';
import { TareaTipo, TareaEstado, TareaPrioridad } from '../enums/tarea.enum';
import { HuEstado } from '../../historias-usuario/enums/historia-usuario.enum';
import { HistorialCambioService } from '../../common/services/historial-cambio.service';
import { HistorialEntidadTipo, HistorialAccion } from '../../common/enums/historial-cambio.enum';
import { NotificacionService } from '../../../notificaciones/services/notificacion.service';
import { TipoNotificacion } from '../../../notificaciones/enums/tipo-notificacion.enum';
import { HuEvidenciaPdfService } from '../../historias-usuario/services/hu-evidencia-pdf.service';
import { Role } from '../../../../common/constants/roles.constant';
import { MinioService } from '../../../storage/services/minio.service';

// Configuración de WIP limits por defecto por columna
const DEFAULT_WIP_LIMITS: Record<TareaEstado, number | null> = {
  [TareaEstado.POR_HACER]: null, // Sin límite
  [TareaEstado.EN_PROGRESO]: 5,  // Máximo 5 tareas en progreso
  [TareaEstado.EN_REVISION]: null, // Sin límite - pendiente de revisión
  [TareaEstado.FINALIZADO]: null, // Sin límite
};

@Injectable()
export class TareaService {
  constructor(
    @InjectRepository(Tarea)
    private readonly tareaRepository: Repository<Tarea>,
    @InjectRepository(EvidenciaTarea)
    private readonly evidenciaRepository: Repository<EvidenciaTarea>,
    @InjectRepository(TareaAsignado)
    private readonly tareaAsignadoRepository: Repository<TareaAsignado>,
    @InjectRepository(Subtarea)
    private readonly subtareaRepository: Repository<Subtarea>,
    @InjectRepository(HistoriaUsuario)
    private readonly historiaUsuarioRepository: Repository<HistoriaUsuario>,
    @InjectRepository(Sprint)
    private readonly sprintRepository: Repository<Sprint>,
    @InjectRepository(Proyecto)
    private readonly proyectoRepository: Repository<Proyecto>,
    @InjectRepository(Actividad)
    private readonly actividadRepository: Repository<Actividad>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(Personal)
    private readonly personalRepository: Repository<Personal>,
    private readonly historialCambioService: HistorialCambioService,
    @Inject(forwardRef(() => NotificacionService))
    private readonly notificacionService: NotificacionService,
    private readonly huEvidenciaPdfService: HuEvidenciaPdfService,
    private readonly minioService: MinioService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Genera la urlAccion correcta para notificaciones de tarea según su tipo.
   * Incluye el ID del proyecto/actividad en la URL para navegación directa sin localStorage.
   * SCRUM → /poi/proyecto/detalles?id={proyectoId}&tab=Backlog
   * KANBAN → /poi/actividad/detalles?id={actividadId}&tab=Lista
   */
  private async buildTareaUrlAccion(tarea: { tipo: TareaTipo; historiaUsuarioId?: number | null; actividadId?: number | null }): Promise<string> {
    if (tarea.tipo === TareaTipo.KANBAN && tarea.actividadId) {
      return `/poi/actividad/detalles?id=${tarea.actividadId}&tab=Lista`;
    }
    if (tarea.tipo === TareaTipo.SCRUM && tarea.historiaUsuarioId) {
      const hu = await this.historiaUsuarioRepository.findOne({
        where: { id: tarea.historiaUsuarioId },
        select: ['id', 'proyectoId'],
      });
      if (hu?.proyectoId) {
        return `/poi/proyecto/detalles?id=${hu.proyectoId}&tab=Backlog`;
      }
    }
    // Fallback sin ID
    if (tarea.tipo === TareaTipo.KANBAN) {
      return '/poi/actividad/detalles?tab=Lista';
    }
    return '/poi/proyecto/detalles?tab=Backlog';
  }

  /**
   * Obtiene el proyectoId asociado a la tarea para incluir en notificaciones.
   * SCRUM: proyectoId desde la HU. KANBAN: actividadId.
   */
  private async getTareaProyectoId(tarea: { tipo: TareaTipo; historiaUsuarioId?: number | null; actividadId?: number | null }): Promise<number | undefined> {
    if (tarea.tipo === TareaTipo.SCRUM && tarea.historiaUsuarioId) {
      const hu = await this.historiaUsuarioRepository.findOne({
        where: { id: tarea.historiaUsuarioId },
        select: ['id', 'proyectoId'],
      });
      return hu?.proyectoId;
    }
    return undefined;
  }

  private getTareaActividadId(tarea: { tipo: TareaTipo; actividadId?: number | null }): number | undefined {
    if (tarea.tipo === TareaTipo.KANBAN && tarea.actividadId) {
      return tarea.actividadId;
    }
    return undefined;
  }

  async create(createDto: CreateTareaDto, userId?: number, userRole?: string): Promise<Tarea> {
    // Validate that either historiaUsuarioId or actividadId is provided based on type
    if (createDto.tipo === TareaTipo.SCRUM && !createDto.historiaUsuarioId) {
      throw new BadRequestException('historiaUsuarioId es requerido para tareas SCRUM');
    }
    if (createDto.tipo === TareaTipo.KANBAN && !createDto.actividadId) {
      throw new BadRequestException('actividadId es requerido para tareas KANBAN');
    }

    // IMPLEMENTADOR no puede crear tareas en actividades (solo subtareas)
    if (userRole === Role.IMPLEMENTADOR && createDto.tipo === TareaTipo.KANBAN) {
      throw new ForbiddenException('Los implementadores no pueden crear tareas en actividades. Solo pueden crear subtareas en tareas donde estén asignados.');
    }

    // No se pueden crear tareas KANBAN en actividades finalizadas
    if (createDto.tipo === TareaTipo.KANBAN && createDto.actividadId) {
      const actividad = await this.actividadRepository.findOne({
        where: { id: createDto.actividadId },
        select: ['id', 'estado'],
      });
      if (actividad && actividad.estado === 'Finalizado') {
        throw new ForbiddenException('No se pueden crear tareas en una actividad finalizada');
      }
    }

    // DESARROLLADOR solo puede crear tareas en HUs donde está asignado como responsable
    // asignadoA en la HU guarda IDs de la tabla personal (personalId), no de usuarios (userId)
    if (userRole === Role.DESARROLLADOR && createDto.tipo === TareaTipo.SCRUM && createDto.historiaUsuarioId && userId) {
      const hu = await this.historiaUsuarioRepository.findOne({
        where: { id: createDto.historiaUsuarioId },
        select: ['id', 'asignadoA'],
      });
      if (!hu) {
        throw new NotFoundException('Historia de usuario no encontrada');
      }
      const personal = await this.personalRepository.findOne({
        where: { usuarioId: userId },
        select: ['id'],
      });
      const personalId = personal?.id;
      const asignados = (hu.asignadoA || []).map(id => Number(id));
      if (!personalId || !asignados.includes(personalId)) {
        throw new ForbiddenException('Solo puedes crear tareas en historias de usuario donde estás asignado como responsable');
      }

      // DESARROLLADOR solo puede asignarse a sí mismo
      if (createDto.asignadosIds && createDto.asignadosIds.length > 0) {
        if (createDto.asignadosIds.some(id => id !== userId)) {
          throw new ForbiddenException('Como Desarrollador, solo puedes asignarte a ti mismo');
        }
      } else if (createDto.asignadoA && createDto.asignadoA !== userId) {
        throw new ForbiddenException('Como Desarrollador, solo puedes asignarte a ti mismo');
      }
    }

    // Validar fechas de la tarea contra el rango de la HU (solo para tareas SCRUM)
    if (createDto.tipo === TareaTipo.SCRUM && createDto.historiaUsuarioId) {
      await this.validarFechasContraHistoria(
        createDto.historiaUsuarioId,
        createDto.fechaInicio,
        createDto.fechaFin,
      );
    }

    // Check for duplicate code
    const whereCondition = createDto.tipo === TareaTipo.SCRUM
      ? { historiaUsuarioId: createDto.historiaUsuarioId, codigo: createDto.codigo }
      : { actividadId: createDto.actividadId, codigo: createDto.codigo };

    const existing = await this.tareaRepository.findOne({ where: whereCondition });

    if (existing) {
      throw new ConflictException(`Ya existe una tarea con el código ${createDto.codigo}`);
    }

    // Filtrar asignadoA y asignadosIds para manejar por separado
    const { asignadoA, asignadosIds, ...restDto } = createDto;

    // Si hay asignadosIds, usar el primero como asignadoA principal (compatibilidad)
    const asignadoPrincipal = asignadosIds && asignadosIds.length > 0
      ? asignadosIds[0]
      : (asignadoA ?? undefined);

    const tarea = this.tareaRepository.create({
      ...restDto,
      asignadoA: asignadoPrincipal,
      createdBy: userId,
      updatedBy: userId,
    });

    const tareaGuardada = await this.tareaRepository.save(tarea);

    // Crear entradas en tarea_asignados para todos los responsables
    if (asignadosIds && asignadosIds.length > 0) {
      const asignaciones = asignadosIds.map(usuarioId =>
        this.tareaAsignadoRepository.create({
          tareaId: tareaGuardada.id,
          usuarioId,
          rol: 'IMPLEMENTADOR',
          asignadoPor: userId,
        })
      );
      await this.tareaAsignadoRepository.save(asignaciones);

      // Notificar a todos los asignados
      const urlAccionCreate = await this.buildTareaUrlAccion(tareaGuardada);
      const notifProyectoId = await this.getTareaProyectoId(tareaGuardada);
      const notifActividadId = this.getTareaActividadId(tareaGuardada);
      for (const usuarioId of asignadosIds) {
        if (usuarioId !== userId) {
          await this.notificacionService.notificar(
            TipoNotificacion.TAREAS,
            usuarioId,
            {
              titulo: `Nueva tarea asignada: ${tareaGuardada.codigo}`,
              descripcion: `Se te ha asignado la tarea "${tareaGuardada.nombre}"`,
              entidadTipo: 'Tarea',
              entidadId: tareaGuardada.id,
              proyectoId: notifProyectoId,
              actividadId: notifActividadId,
              urlAccion: urlAccionCreate,
            },
          );
        }
      }
    } else if (asignadoA && asignadoA !== userId) {
      // Compatibilidad: si solo se envió asignadoA, notificar
      const notifProyectoIdCompat = await this.getTareaProyectoId(tareaGuardada);
      const notifActividadIdCompat = this.getTareaActividadId(tareaGuardada);
      await this.notificacionService.notificar(
        TipoNotificacion.TAREAS,
        asignadoA,
        {
          titulo: `Nueva tarea asignada: ${tareaGuardada.codigo}`,
          descripcion: `Se te ha asignado la tarea "${tareaGuardada.nombre}"`,
          entidadTipo: 'Tarea',
          entidadId: tareaGuardada.id,
          proyectoId: notifProyectoIdCompat,
          actividadId: notifActividadIdCompat,
          urlAccion: await this.buildTareaUrlAccion(tareaGuardada),
        },
      );
    }

    // Notificar al coordinador/gestor cuando se crea una tarea KANBAN en su actividad
    if (tareaGuardada.tipo === TareaTipo.KANBAN && tareaGuardada.actividadId) {
      const actividad = await this.actividadRepository.findOne({
        where: { id: tareaGuardada.actividadId },
        select: ['id', 'codigo', 'nombre', 'coordinadorId', 'gestorId'],
      });

      if (actividad) {
        const urlAccionKanban = await this.buildTareaUrlAccion(tareaGuardada);
        const destinatariosGestores: number[] = [];

        // Agregar coordinador si existe y no es el creador ni el asignado
        if (actividad.coordinadorId && actividad.coordinadorId !== userId && actividad.coordinadorId !== asignadoPrincipal) {
          destinatariosGestores.push(actividad.coordinadorId);
        }

        // Agregar gestor si existe y no es el creador ni el asignado ni el coordinador
        if (actividad.gestorId && actividad.gestorId !== userId && actividad.gestorId !== asignadoPrincipal && actividad.gestorId !== actividad.coordinadorId) {
          destinatariosGestores.push(actividad.gestorId);
        }

        // Notificar a coordinador/gestor
        if (destinatariosGestores.length > 0) {
          await this.notificacionService.notificarMultiples(
            TipoNotificacion.TAREAS,
            destinatariosGestores,
            {
              titulo: `Nueva tarea creada ${tareaGuardada.codigo}: ${tareaGuardada.nombre}`,
              descripcion: `Se ha creado una nueva tarea en la actividad "${actividad.nombre}" - Estado: ${tareaGuardada.estado}`,
              entidadTipo: 'Tarea',
              entidadId: tareaGuardada.id,
              actividadId: tareaGuardada.actividadId,
              urlAccion: urlAccionKanban,
            },
          );
        }
      }
    }

    // Registrar creacion en historial
    if (userId) {
      await this.historialCambioService.registrarCreacion(
        HistorialEntidadTipo.TAREA,
        tareaGuardada.id,
        userId,
        { codigo: tareaGuardada.codigo, nombre: tareaGuardada.nombre },
      );
    }

    // Auto-transition: HU pasa a "En progreso" cuando se crea una tarea SCRUM
    if (tareaGuardada.tipo === TareaTipo.SCRUM && tareaGuardada.historiaUsuarioId) {
      await this.autoTransicionHUAlCrearTarea(tareaGuardada.historiaUsuarioId, userId);
    }

    // Auto-transition: Actividad pasa de "Pendiente" a "En desarrollo" cuando se crea una tarea KANBAN
    if (tareaGuardada.tipo === TareaTipo.KANBAN && tareaGuardada.actividadId) {
      await this.recalcularEstadoActividad(tareaGuardada.actividadId, userId);
    }

    return tareaGuardada;
  }

  async findAll(filters?: {
    tipo?: TareaTipo;
    historiaUsuarioId?: number;
    actividadId?: number;
    sprintId?: number;
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

    if (filters?.sprintId) {
      queryBuilder.innerJoin('tarea.historiaUsuario', 'hu', 'hu.sprintId = :sprintId', {
        sprintId: filters.sprintId,
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
      relations: ['asignado', 'asignados', 'asignados.usuario', 'creator'],
      order: { prioridad: 'ASC', createdAt: 'DESC' },
    });
  }

  async findByActividad(actividadId: number): Promise<Tarea[]> {
    return this.tareaRepository.find({
      where: { actividadId, activo: true },
      relations: ['asignado', 'asignados', 'asignados.usuario', 'creator'],
      order: { prioridad: 'ASC', createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Tarea> {
    const tarea = await this.tareaRepository.findOne({
      where: { id },
      relations: ['historiaUsuario', 'actividad', 'asignado', 'validador', 'asignados', 'asignados.usuario', 'creator'],
    });

    if (!tarea) {
      throw new NotFoundException(`Tarea con ID ${id} no encontrada`);
    }

    return tarea;
  }

  async update(id: number, updateDto: UpdateTareaDto, userId?: number, userRole?: string): Promise<Tarea> {
    const tarea = await this.findOne(id);

    // Verificar si la tarea está finalizada
    if (tarea.estado === TareaEstado.FINALIZADO) {
      throw new ForbiddenException('No se puede editar una tarea finalizada');
    }

    // IMPLEMENTADOR no puede editar tareas, solo ver detalles
    if (userRole === 'IMPLEMENTADOR') {
      throw new ForbiddenException('Los implementadores no pueden editar tareas, solo pueden ver detalles');
    }

    // DESARROLLADOR solo puede editar tareas donde es el responsable
    if (userRole === Role.DESARROLLADOR && tarea.tipo === TareaTipo.SCRUM && userId) {
      if (tarea.asignadoA !== userId) {
        throw new ForbiddenException('Solo puedes editar tareas donde eres el responsable');
      }

      // DESARROLLADOR no puede reasignar a otra persona
      if (updateDto.asignadosIds && updateDto.asignadosIds.length > 0) {
        if (updateDto.asignadosIds.some(id => id !== userId)) {
          throw new ForbiddenException('Como Desarrollador, no puedes reasignar tareas a otras personas');
        }
      } else if (updateDto.asignadoA !== undefined && updateDto.asignadoA !== userId) {
        throw new ForbiddenException('Como Desarrollador, no puedes reasignar tareas a otras personas');
      }
    }

    // Si es tarea SCRUM, verificar estado de HU
    if (tarea.tipo === TareaTipo.SCRUM && tarea.historiaUsuarioId) {
      const hu = await this.historiaUsuarioRepository.findOne({
        where: { id: tarea.historiaUsuarioId },
      });
      if (hu?.estado === HuEstado.EN_REVISION) {
        throw new BadRequestException(
          'No se puede editar una tarea cuya Historia de Usuario está en revisión. Espere a que sea validada o rechazada.',
        );
      }
      if (hu?.estado === HuEstado.FINALIZADO) {
        throw new BadRequestException(
          'No se puede editar una tarea cuya Historia de Usuario ya fue validada y finalizada.',
        );
      }
    }

    // Validar fechas de la tarea contra el rango de la HU (solo para tareas SCRUM)
    if (tarea.tipo === TareaTipo.SCRUM && tarea.historiaUsuarioId) {
      const fechaInicio = updateDto.fechaInicio !== undefined
        ? updateDto.fechaInicio
        : (tarea.fechaInicio instanceof Date ? tarea.fechaInicio.toISOString().split('T')[0] : tarea.fechaInicio);
      const fechaFin = updateDto.fechaFin !== undefined
        ? updateDto.fechaFin
        : (tarea.fechaFin instanceof Date ? tarea.fechaFin.toISOString().split('T')[0] : tarea.fechaFin);
      await this.validarFechasContraHistoria(tarea.historiaUsuarioId, fechaInicio, fechaFin);
    }

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

    // Extraer asignadosIds para manejar por separado
    const { asignadosIds, ...restUpdateDto } = updateDto;

    // Si hay asignadosIds, actualizar el asignadoA principal con el primero
    if (asignadosIds && asignadosIds.length > 0) {
      restUpdateDto.asignadoA = asignadosIds[0];
    }

    Object.assign(tarea, restUpdateDto, { updatedBy: userId });

    // Si se actualizó asignadoA, limpiar la relación 'asignado' para evitar conflicto con TypeORM
    // TypeORM usa la relación ManyToOne al guardar, lo que puede sobreescribir el valor del campo
    if (updateDto.asignadoA !== undefined) {
      tarea.asignado = null as any;
    }

    const tareaActualizada = await this.tareaRepository.save(tarea);

    // Actualizar asignados en tabla tarea_asignados si se proporcionó asignadosIds
    if (asignadosIds && asignadosIds.length > 0) {
      // Eliminar asignaciones anteriores
      await this.tareaAsignadoRepository.delete({ tareaId: id });

      // Crear nuevas asignaciones
      const asignaciones = asignadosIds.map(usuarioId =>
        this.tareaAsignadoRepository.create({
          tareaId: id,
          usuarioId,
          rol: 'IMPLEMENTADOR',
          asignadoPor: userId,
        })
      );
      await this.tareaAsignadoRepository.save(asignaciones);

      // Notificar a los nuevos asignados
      const urlAccionUpdate = await this.buildTareaUrlAccion(tarea);
      const updateProyectoId = await this.getTareaProyectoId(tarea);
      const updateActividadId = this.getTareaActividadId(tarea);
      for (const usuarioId of asignadosIds) {
        if (usuarioId !== userId && usuarioId !== valoresAnteriores.asignadoA) {
          await this.notificacionService.notificar(
            TipoNotificacion.TAREAS,
            usuarioId,
            {
              titulo: `Tarea asignada: ${tarea.codigo}`,
              descripcion: `Se te ha asignado la tarea "${tarea.nombre}"`,
              entidadTipo: 'Tarea',
              entidadId: tarea.id,
              proyectoId: updateProyectoId,
              actividadId: updateActividadId,
              urlAccion: urlAccionUpdate,
            },
          );
        }
      }
    }

    // Registrar cambios en historial (con nombres de usuario para asignadoA)
    if (userId) {
      // Resolver nombres de usuario para asignadoA si hay cambios
      let valoresAnterioresHistorial = { ...valoresAnteriores };
      let valoresNuevosHistorial = { ...updateDto };

      if (updateDto.asignadoA !== undefined || valoresAnteriores.asignadoA !== undefined) {
        // Obtener nombre del asignado anterior
        if (valoresAnteriores.asignadoA) {
          const usuarioAnterior = await this.usuarioRepository.findOne({
            where: { id: valoresAnteriores.asignadoA },
            select: ['id', 'nombre', 'apellido'],
          });
          if (usuarioAnterior) {
            valoresAnterioresHistorial = {
              ...valoresAnterioresHistorial,
              asignadoA: `${usuarioAnterior.nombre} ${usuarioAnterior.apellido}`.trim() as any,
            };
          }
        }

        // Obtener nombre del asignado nuevo
        if (updateDto.asignadoA) {
          const usuarioNuevo = await this.usuarioRepository.findOne({
            where: { id: updateDto.asignadoA },
            select: ['id', 'nombre', 'apellido'],
          });
          if (usuarioNuevo) {
            valoresNuevosHistorial = {
              ...valoresNuevosHistorial,
              asignadoA: `${usuarioNuevo.nombre} ${usuarioNuevo.apellido}`.trim() as any,
            };
          }
        } else if (updateDto.asignadoA === null) {
          valoresNuevosHistorial = {
            ...valoresNuevosHistorial,
            asignadoA: 'Sin asignar' as any,
          };
        }
      }

      await this.historialCambioService.registrarCambiosMultiples(
        HistorialEntidadTipo.TAREA,
        id,
        valoresAnterioresHistorial,
        valoresNuevosHistorial,
        userId,
      );
    }

    // Notificar si se cambia el asignado
    if (updateDto.asignadoA && updateDto.asignadoA !== valoresAnteriores.asignadoA && updateDto.asignadoA !== userId) {
      const reassignProyectoId = await this.getTareaProyectoId(tarea);
      const reassignActividadId = this.getTareaActividadId(tarea);
      await this.notificacionService.notificar(
        TipoNotificacion.TAREAS,
        updateDto.asignadoA,
        {
          titulo: `Tarea asignada: ${tarea.codigo}`,
          descripcion: `Se te ha asignado la tarea "${tarea.nombre}"`,
          entidadTipo: 'Tarea',
          entidadId: tarea.id,
          proyectoId: reassignProyectoId,
          actividadId: reassignActividadId,
          urlAccion: await this.buildTareaUrlAccion(tarea),
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

    // If finalizing, require evidencias for SCRUM tasks (using evidencias_tarea table)
    if (
      cambiarEstadoDto.estado === TareaEstado.FINALIZADO &&
      tarea.tipo === TareaTipo.SCRUM
    ) {
      const evidencias = await this.obtenerEvidencias(id);
      if (evidencias.length === 0) {
        throw new BadRequestException(
          'Se requiere al menos una evidencia para finalizar una tarea SCRUM',
        );
      }
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

    // Actualizar fechas para métricas Kanban
    if (cambiarEstadoDto.estado === TareaEstado.EN_PROGRESO && !tarea.fechaInicioProgreso) {
      tarea.fechaInicioProgreso = new Date();
    }
    if (cambiarEstadoDto.estado === TareaEstado.FINALIZADO) {
      tarea.fechaCompletado = new Date();
    }
    // Limpiar fechaCompletado si se mueve fuera de Finalizado
    if (estadoAnterior === TareaEstado.FINALIZADO && cambiarEstadoDto.estado !== TareaEstado.FINALIZADO) {
      tarea.fechaCompletado = null as any;
    }

    if (cambiarEstadoDto.horasReales !== undefined) {
      tarea.horasReales = cambiarEstadoDto.horasReales;
    }

    // evidenciaUrl eliminado - usar tabla evidencias_tarea en su lugar

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

      const statusChangeProyectoId = await this.getTareaProyectoId(tarea);
      const statusChangeActividadId = this.getTareaActividadId(tarea);
      await this.notificacionService.notificar(
        TipoNotificacion.TAREAS,
        tarea.asignadoA,
        {
          titulo: `Tarea actualizada: ${tarea.codigo}`,
          descripcion: `La tarea "${tarea.nombre}" ${mensajeEstado}`,
          entidadTipo: 'Tarea',
          entidadId: tarea.id,
          proyectoId: statusChangeProyectoId,
          actividadId: statusChangeActividadId,
          urlAccion: await this.buildTareaUrlAccion(tarea),
        },
      );
    }

    // Notificar al coordinador/gestor cuando una tarea KANBAN cambia de estado
    if (estadoAnterior !== cambiarEstadoDto.estado && tarea.tipo === TareaTipo.KANBAN && tarea.actividadId) {
      const actividad = await this.actividadRepository.findOne({
        where: { id: tarea.actividadId },
        select: ['id', 'codigo', 'nombre', 'coordinadorId', 'gestorId'],
      });

      if (actividad) {
        const mensajeEstadoGestores = cambiarEstadoDto.estado === TareaEstado.FINALIZADO
          ? 'ha sido completada'
          : `ha sido movida a ${cambiarEstadoDto.estado}`;

        const destinatariosGestoresEstado: number[] = [];

        // Agregar coordinador si existe y no es el que cambió el estado ni el asignado
        if (actividad.coordinadorId && actividad.coordinadorId !== userId && actividad.coordinadorId !== tarea.asignadoA) {
          destinatariosGestoresEstado.push(actividad.coordinadorId);
        }

        // Agregar gestor si existe y no es el que cambió el estado ni el asignado ni el coordinador
        if (actividad.gestorId && actividad.gestorId !== userId && actividad.gestorId !== tarea.asignadoA && actividad.gestorId !== actividad.coordinadorId) {
          destinatariosGestoresEstado.push(actividad.gestorId);
        }

        // Notificar a coordinador/gestor
        if (destinatariosGestoresEstado.length > 0) {
          await this.notificacionService.notificarMultiples(
            TipoNotificacion.TAREAS,
            destinatariosGestoresEstado,
            {
              titulo: `Tarea ${tarea.codigo}: ${tarea.nombre} ha sido modificada`,
              descripcion: `La tarea "${tarea.nombre}" ${mensajeEstadoGestores} - Estado: ${cambiarEstadoDto.estado}`,
              entidadTipo: 'Tarea',
              entidadId: tarea.id,
              actividadId: tarea.actividadId,
              urlAccion: await this.buildTareaUrlAccion(tarea),
            },
          );
        }
      }
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

    // Actualizar estado de la HU automáticamente (solo para tareas SCRUM)
    if (tarea.tipo === TareaTipo.SCRUM && tarea.historiaUsuarioId) {
      await this.actualizarEstadoHUSegunTareas(tarea.historiaUsuarioId, userId);
    }

    // Actualizar estado de la Actividad automáticamente (solo para tareas KANBAN)
    if (tarea.tipo === TareaTipo.KANBAN && tarea.actividadId) {
      await this.recalcularEstadoActividad(tarea.actividadId, userId);
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

    // Notificar al usuario asignado sobre la validación/rechazo
    if (tarea.asignadoA && tarea.asignadoA !== userId) {
      try {
        const esValidada = validarDto.validada;
        const titulo = esValidada
          ? `Tarea validada: ${tarea.codigo}`
          : `Tarea rechazada: ${tarea.codigo}`;
        const descripcion = esValidada
          ? `La tarea "${tarea.nombre}" ha sido validada.`
          : `La tarea "${tarea.nombre}" ha sido rechazada.${validarDto.observacion ? ` Observación: ${validarDto.observacion}` : ''}`;

        // Determinar URL según tipo de tarea
        const urlAccion = await this.buildTareaUrlAccion(tarea);

        await this.notificacionService.notificar(
          TipoNotificacion.APROBACIONES,
          tarea.asignadoA,
          {
            titulo,
            descripcion,
            entidadTipo: 'Tarea',
            entidadId: tarea.id,
            proyectoId: tarea.tipo === TareaTipo.SCRUM ? tarea.historiaUsuario?.proyecto?.id : undefined,
            actividadId: this.getTareaActividadId(tarea),
            urlAccion,
          },
        );
      } catch (error) {
        console.error('Error sending task validation notification:', error);
      }
    }

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

  async remove(id: number, userId?: number, userRole?: string): Promise<Tarea> {
    const tarea = await this.findOne(id);

    // Verificar si la tarea está finalizada
    if (tarea.estado === TareaEstado.FINALIZADO) {
      throw new ForbiddenException('No se puede eliminar una tarea finalizada');
    }

    // IMPLEMENTADOR no puede eliminar tareas
    if (userRole === 'IMPLEMENTADOR') {
      throw new ForbiddenException('Los implementadores no pueden eliminar tareas');
    }

    // DESARROLLADOR solo puede eliminar tareas donde es el responsable
    if (userRole === Role.DESARROLLADOR && tarea.tipo === TareaTipo.SCRUM && userId) {
      if (tarea.asignadoA !== userId) {
        throw new ForbiddenException('Solo puedes eliminar tareas donde eres el responsable');
      }
    }

    // Hard delete: eliminar subtareas (y sus evidencias), asignados, evidencias y la tarea
    // 1. Eliminar evidencias de subtareas y luego las subtareas
    const subtareas = await this.subtareaRepository.find({
      where: { tareaId: id },
      select: ['id'],
    });
    if (subtareas.length > 0) {
      const subtareaIds = subtareas.map(s => s.id);
      await this.subtareaRepository.manager
        .createQueryBuilder()
        .delete()
        .from('agile.evidencias_subtarea')
        .where('subtarea_id IN (:...ids)', { ids: subtareaIds })
        .execute();
    }
    await this.subtareaRepository.delete({ tareaId: id });

    // 2. Eliminar asignados y evidencias de la tarea
    await this.tareaAsignadoRepository.delete({ tareaId: id });
    await this.evidenciaRepository.delete({ tareaId: id });

    // 3. Eliminar la tarea
    await this.tareaRepository.remove(tarea);

    // Registrar eliminacion en historial
    if (userId) {
      await this.historialCambioService.registrarEliminacion(
        HistorialEntidadTipo.TAREA,
        id,
        userId,
      );
    }

    return { ...tarea, id } as Tarea;
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

    // Cambiar estado de la tarea a "Finalizado" y actualizar fecha_completado
    if (tarea.estado !== TareaEstado.FINALIZADO) {
      const estadoAnterior = tarea.estado;

      await this.tareaRepository.update(tareaId, {
        estado: TareaEstado.FINALIZADO,
        fechaCompletado: new Date(),
        updatedBy: userId,
      });

      // Registrar cambio de estado
      await this.historialCambioService.registrarCambioEstado(
        HistorialEntidadTipo.TAREA,
        tareaId,
        estadoAnterior,
        TareaEstado.FINALIZADO,
        userId,
      );

      console.log(`[Tarea ${tarea.codigo}] Evidencia agregada → Estado cambiado a "Finalizado"`);
    } else {
      // Si ya está en Finalizado, solo actualizar la fecha
      await this.tareaRepository.update(tareaId, {
        fechaCompletado: new Date(),
        updatedBy: userId,
      });
    }

    // Actualizar estado de la HU automáticamente (solo para tareas SCRUM)
    // Se ejecuta siempre que se agrega evidencia para verificar si todas las tareas tienen evidencias
    if (tarea.tipo === TareaTipo.SCRUM && tarea.historiaUsuarioId) {
      await this.actualizarEstadoHUSegunTareas(tarea.historiaUsuarioId, userId);
    }

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
    const tarea = await this.findOne(tareaId);

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

    // Verificar si la tarea queda sin evidencias
    const evidenciasRestantes = await this.evidenciaRepository.count({
      where: { tareaId },
    });

    // Si no quedan evidencias y la tarea está en "Finalizado", cambiar a "En progreso"
    if (evidenciasRestantes === 0 && tarea.estado === TareaEstado.FINALIZADO) {
      const estadoAnterior = tarea.estado;

      await this.tareaRepository.update(tareaId, {
        estado: TareaEstado.EN_PROGRESO,
        fechaCompletado: null as any, // Limpiar fecha de completado
        updatedBy: userId,
      });

      // Registrar cambio de estado
      await this.historialCambioService.registrarCambioEstado(
        HistorialEntidadTipo.TAREA,
        tareaId,
        estadoAnterior,
        TareaEstado.EN_PROGRESO,
        userId,
      );

      console.log(`[Tarea ${tarea.codigo}] Última evidencia eliminada → Estado cambiado a "En progreso"`);

      // Si la HU estaba en "En revisión", también debe volver a "En progreso"
      if (tarea.tipo === TareaTipo.SCRUM && tarea.historiaUsuarioId) {
        const hu = await this.historiaUsuarioRepository.findOne({
          where: { id: tarea.historiaUsuarioId, activo: true },
        });

        if (hu && hu.estado === HuEstado.EN_REVISION) {
          const huEstadoAnterior = hu.estado;

          await this.historiaUsuarioRepository.update(tarea.historiaUsuarioId, {
            estado: HuEstado.EN_PROGRESO,
            documentoEvidenciasUrl: null, // Invalidar el PDF anterior
            updatedBy: userId,
          });

          // Registrar cambio de estado de la HU
          await this.historialCambioService.registrarCambioEstado(
            HistorialEntidadTipo.HISTORIA_USUARIO,
            tarea.historiaUsuarioId,
            huEstadoAnterior,
            HuEstado.EN_PROGRESO,
            userId,
          );

          console.log(`[HU-${hu.codigo}] Evidencia de tarea eliminada → Estado cambiado a "En progreso"`);
        }
      }
    }
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

  /**
   * Valida que las fechas de la tarea estén dentro del rango de fechas de la HU
   */
  private async validarFechasContraHistoria(
    historiaUsuarioId: number,
    fechaInicio: string | null | undefined,
    fechaFin: string | null | undefined,
  ): Promise<void> {
    if (!fechaInicio && !fechaFin) return;

    const historia = await this.historiaUsuarioRepository.findOne({
      where: { id: historiaUsuarioId },
      select: ['id', 'codigo', 'fechaInicio', 'fechaFin'],
    });

    if (!historia) {
      throw new NotFoundException(`Historia de usuario con ID ${historiaUsuarioId} no encontrada`);
    }

    // Si la HU no tiene fechas definidas, no validar
    if (!historia.fechaInicio && !historia.fechaFin) return;

    const huInicio = historia.fechaInicio ? new Date(historia.fechaInicio) : null;
    const huFin = historia.fechaFin ? new Date(historia.fechaFin) : null;

    if (fechaInicio) {
      const tareaInicio = new Date(fechaInicio);
      if (huInicio && tareaInicio < huInicio) {
        throw new BadRequestException(
          `La fecha de inicio de la tarea (${fechaInicio}) no puede ser anterior a la fecha de inicio de la HU ${historia.codigo} (${historia.fechaInicio})`,
        );
      }
      if (huFin && tareaInicio > huFin) {
        throw new BadRequestException(
          `La fecha de inicio de la tarea (${fechaInicio}) no puede ser posterior a la fecha fin de la HU ${historia.codigo} (${historia.fechaFin})`,
        );
      }
    }

    if (fechaFin) {
      const tareaFin = new Date(fechaFin);
      if (huInicio && tareaFin < huInicio) {
        throw new BadRequestException(
          `La fecha fin de la tarea (${fechaFin}) no puede ser anterior a la fecha de inicio de la HU ${historia.codigo} (${historia.fechaInicio})`,
        );
      }
      if (huFin && tareaFin > huFin) {
        throw new BadRequestException(
          `La fecha fin de la tarea (${fechaFin}) no puede ser posterior a la fecha fin de la HU ${historia.codigo} (${historia.fechaFin})`,
        );
      }
    }

    // Validar que fecha inicio no sea mayor que fecha fin
    if (fechaInicio && fechaFin) {
      const tareaInicio = new Date(fechaInicio);
      const tareaFin = new Date(fechaFin);
      if (tareaInicio > tareaFin) {
        throw new BadRequestException(
          'La fecha de inicio de la tarea no puede ser posterior a la fecha fin',
        );
      }
    }
  }

  /**
   * Auto-transición de HU al crear una tarea SCRUM:
   * Si la HU está en "Por hacer", pasa a "En progreso" automáticamente.
   */
  private async autoTransicionHUAlCrearTarea(historiaUsuarioId: number, userId?: number): Promise<void> {
    const hu = await this.historiaUsuarioRepository.findOne({
      where: { id: historiaUsuarioId, activo: true },
    });

    if (!hu) return;

    // Solo transicionar si está en "Por hacer"
    if (hu.estado !== HuEstado.POR_HACER) return;

    const estadoAnterior = hu.estado;

    await this.historiaUsuarioRepository.update(historiaUsuarioId, {
      estado: HuEstado.EN_PROGRESO,
      updatedBy: userId,
    });

    // Registrar cambio de estado en historial
    if (userId) {
      await this.historialCambioService.registrarCambioEstado(
        HistorialEntidadTipo.HISTORIA_USUARIO,
        historiaUsuarioId,
        estadoAnterior,
        HuEstado.EN_PROGRESO,
        userId,
      );
    }

    console.log(`[HU-${hu.codigo}] Tarea creada → Estado cambiado automáticamente a "En progreso".`);

    // Recalcular estado del sprint (puede auto-iniciar si estaba en "Por hacer")
    if (hu.sprintId) {
      await this.recalcularEstadoSprintDesdeTarea(hu.sprintId, userId);
    }
  }

  /**
   * Actualiza el estado de la Historia de Usuario según el estado de sus tareas
   * Lógica:
   * - Si alguna tarea pasa a "Finalizado" → HU pasa a "En progreso" (si tiene más de 1 tarea)
   * - Si TODAS las tareas están "Finalizado" → HU pasa a "En revisión" y se genera PDF
   * - Si solo tiene 1 tarea y está "Finalizado" → HU pasa a "En revisión" y se genera PDF
   */
  async actualizarEstadoHUSegunTareas(historiaUsuarioId: number, userId?: number): Promise<void> {
    // Obtener la HU
    const hu = await this.historiaUsuarioRepository.findOne({
      where: { id: historiaUsuarioId, activo: true },
    });

    if (!hu) return;

    // No actualizar si la HU ya está en "Finalizado" o "En revisión"
    if (hu.estado === HuEstado.FINALIZADO || hu.estado === HuEstado.EN_REVISION) return;

    // Obtener todas las tareas activas de la HU
    const tareas = await this.tareaRepository.find({
      where: {
        historiaUsuarioId,
        activo: true,
        tipo: TareaTipo.SCRUM,
      },
    });

    // Si no hay tareas, no hacer nada
    if (tareas.length === 0) return;

    // Contar tareas finalizadas
    const tareasFinalizadas = tareas.filter(t => t.estado === TareaEstado.FINALIZADO);
    const todasFinalizadas = tareasFinalizadas.length === tareas.length;

    // Si todas las tareas están finalizadas → HU pasa a "En revisión"
    // (Las tareas SCRUM ya requieren evidencia para finalizarse, no es necesario verificar de nuevo)
    if (todasFinalizadas) {
      const estadoAnterior = hu.estado;

      // Obtener proyecto para el PDF y notificación
      const proyecto = await this.proyectoRepository.findOne({
        where: { id: hu.proyectoId },
      });

      // Obtener sprint (si existe) para el PDF
      let sprintNombre: string | null = null;
      if (hu.sprintId) {
        const huConSprint = await this.historiaUsuarioRepository.findOne({
          where: { id: historiaUsuarioId },
          relations: ['sprint'],
        });
        sprintNombre = huConSprint?.sprint?.nombre || null;
      }

      // Generar PDF consolidado de evidencias
      let pdfUrl = '';
      try {
        const pdfBuffer = await this.huEvidenciaPdfService.generateEvidenciasPdf(
          historiaUsuarioId,
          { codigo: proyecto?.codigo || '', nombre: proyecto?.nombre || '' },
          sprintNombre ? { nombre: sprintNombre } : null,
        );

        // Subir PDF a MinIO
        const bucketName = this.configService.get('minio.buckets.documentos', 'sigp-documentos');
        const objectKey = `evidencias/hu/${hu.codigo}_evidencias_${Date.now()}.pdf`;

        await this.minioService.putObject(
          bucketName,
          objectKey,
          pdfBuffer,
          pdfBuffer.length,
          { 'Content-Type': 'application/pdf' },
        );

        // Generar URL de descarga
        pdfUrl = await this.minioService.getPresignedGetUrl(bucketName, objectKey, 7 * 24 * 60 * 60); // 7 días

        console.log(`[HU-${hu.codigo}] PDF de evidencias generado: ${objectKey}`);
      } catch (error) {
        console.error(`[HU-${hu.codigo}] Error generando PDF de evidencias:`, error);
        // Continuar aunque falle la generación del PDF
      }

      // Actualizar HU con estado "En revisión" y URL del PDF
      await this.historiaUsuarioRepository.update(historiaUsuarioId, {
        estado: HuEstado.EN_REVISION,
        updatedBy: userId,
        documentoEvidenciasUrl: pdfUrl || null,
      });

      // Registrar cambio de estado en historial
      if (userId) {
        await this.historialCambioService.registrarCambioEstado(
          HistorialEntidadTipo.HISTORIA_USUARIO,
          historiaUsuarioId,
          estadoAnterior,
          HuEstado.EN_REVISION,
          userId,
        );
      }

      // Enviar notificación al SCRUM_MASTER del proyecto
      if (proyecto?.scrumMasterId) {
        try {
          await this.notificacionService.notificar(
            TipoNotificacion.VALIDACIONES,
            proyecto.scrumMasterId,
            {
              titulo: `HU en Revisión: ${hu.codigo}`,
              descripcion: `La Historia de Usuario "${hu.titulo}" del proyecto "${proyecto.nombre}" tiene todas sus tareas finalizadas y está pendiente de validación.`,
              entidadTipo: 'HistoriaUsuario',
              entidadId: hu.id,
              proyectoId: proyecto.id,
              urlAccion: `/poi/proyecto/detalles?id=${proyecto.id}&tab=Backlog`,
            },
          );
          console.log(`[HU-${hu.codigo}] Notificación enviada a SCRUM_MASTER (ID: ${proyecto.scrumMasterId})`);
        } catch (error) {
          console.error(`[HU-${hu.codigo}] Error enviando notificación a SCRUM_MASTER:`, error);
        }
      }

      // Enviar notificación al SCRUM_MASTER del subproyecto (cuando la HU pertenece a un subproyecto)
      if (!hu.proyectoId && hu.subproyectoId) {
        try {
          const subproyecto = await this.tareaRepository.manager.findOne(Subproyecto, {
            where: { id: hu.subproyectoId },
          });
          if (subproyecto?.scrumMasterId) {
            await this.notificacionService.notificar(
              TipoNotificacion.VALIDACIONES,
              subproyecto.scrumMasterId,
              {
                titulo: `HU en Revisión: ${hu.codigo}`,
                descripcion: `La Historia de Usuario "${hu.titulo}" del subproyecto "${subproyecto.nombre}" tiene todas sus tareas finalizadas y está pendiente de validación.`,
                entidadTipo: 'HistoriaUsuario',
                entidadId: hu.id,
                urlAccion: `/poi/subproyecto/detalles?id=${subproyecto.id}&tab=Backlog`,
              },
            );
            console.log(`[HU-${hu.codigo}] Notificación enviada a SCRUM_MASTER de subproyecto (ID: ${subproyecto.scrumMasterId})`);
          }
        } catch (error) {
          console.error(`[HU-${hu.codigo}] Error enviando notificación a SCRUM_MASTER del subproyecto:`, error);
        }
      }

      console.log(`[HU-${hu.codigo}] Todas las tareas finalizadas. Estado cambiado a "En revisión".`);

      // Recalcular estado del sprint (auto-start si estaba en Por hacer)
      if (hu.sprintId) {
        await this.recalcularEstadoSprintDesdeTarea(hu.sprintId, userId);
      }
      return;
    }

    // Si hay alguna tarea finalizada pero no todas, y la HU está en "Por hacer"
    // → cambiar a "En progreso"
    if (tareasFinalizadas.length > 0 && hu.estado === HuEstado.POR_HACER) {
      const estadoAnterior = hu.estado;

      await this.historiaUsuarioRepository.update(historiaUsuarioId, {
        estado: HuEstado.EN_PROGRESO,
        updatedBy: userId,
      });

      // Registrar cambio de estado en historial
      if (userId) {
        await this.historialCambioService.registrarCambioEstado(
          HistorialEntidadTipo.HISTORIA_USUARIO,
          historiaUsuarioId,
          estadoAnterior,
          HuEstado.EN_PROGRESO,
          userId,
        );
      }

      console.log(`[HU-${hu.codigo}] Tarea finalizada. Estado cambiado a "En progreso".`);

      // Recalcular estado del sprint (auto-start si estaba en Por hacer)
      if (hu.sprintId) {
        await this.recalcularEstadoSprintDesdeTarea(hu.sprintId, userId);
      }
    }
  }

  /**
   * Recalcula el estado de un sprint basándose en los estados de sus HUs.
   * Réplica de la lógica en HistoriaUsuarioService.recalcularEstadoSprint
   * para poder llamarla desde actualizarEstadoHUSegunTareas.
   */
  private async recalcularEstadoSprintDesdeTarea(sprintId: number, userId?: number): Promise<void> {
    const sprint = await this.sprintRepository.findOne({
      where: { id: sprintId, activo: true },
    });
    if (!sprint) return;

    const hus = await this.historiaUsuarioRepository.find({
      where: { sprintId, activo: true },
    });
    if (hus.length === 0) return;

    const todasFinalizadas = hus.every(hu => hu.estado === HuEstado.FINALIZADO);
    const algunaEnProgreso = hus.some(hu =>
      hu.estado === HuEstado.EN_PROGRESO || hu.estado === HuEstado.EN_REVISION,
    );

    let nuevoEstado: SprintEstado | null = null;

    if (todasFinalizadas && sprint.estado === SprintEstado.EN_PROGRESO) {
      nuevoEstado = SprintEstado.FINALIZADO;
    } else if (algunaEnProgreso && sprint.estado === SprintEstado.POR_HACER) {
      // Solo auto-iniciar si no hay otro sprint activo en el proyecto o subproyecto
      const otroActivo = sprint.proyectoId
        ? await this.sprintRepository.findOne({
            where: { proyectoId: sprint.proyectoId, estado: SprintEstado.EN_PROGRESO, activo: true },
          })
        : await this.sprintRepository.findOne({
            where: { subproyectoId: sprint.subproyectoId, estado: SprintEstado.EN_PROGRESO, activo: true },
          });
      if (!otroActivo) {
        nuevoEstado = SprintEstado.EN_PROGRESO;
      }
    }

    if (nuevoEstado && nuevoEstado !== sprint.estado) {
      const estadoAnterior = sprint.estado;
      sprint.estado = nuevoEstado;
      sprint.updatedBy = userId;

      if (nuevoEstado === SprintEstado.EN_PROGRESO) {
        sprint.fechaInicioReal = new Date();
      } else if (nuevoEstado === SprintEstado.FINALIZADO) {
        sprint.fechaFinReal = new Date();
      }

      await this.sprintRepository.save(sprint);

      if (userId) {
        await this.historialCambioService.registrarCambioEstado(
          HistorialEntidadTipo.SPRINT,
          sprintId,
          estadoAnterior,
          nuevoEstado,
          userId,
        );
      }

      console.log(`[Sprint ${sprint.nombre}] Estado cambiado automáticamente: ${estadoAnterior} → ${nuevoEstado}`);

      // Notificar equipo sobre cambio de estado automático del sprint
      await this.notificarAutoTransicionSprint(sprint, nuevoEstado);

      // Si sprint se finalizó, verificar si todos los sprints están completos
      if (nuevoEstado === SprintEstado.FINALIZADO) {
        if (sprint.proyectoId) {
          await this.verificarSprintsCompletadosDesdeAutoTransicion(sprint.proyectoId);
        } else if (sprint.subproyectoId) {
          await this.verificarSprintsCompletadosSubproyectoDesdeAutoTransicion(sprint.subproyectoId);
        }
      }
    }
  }

  /**
   * Notifica al Coordinador y Scrum Master sobre auto-transiciones de sprint.
   * Soporta tanto sprints de proyecto como de subproyecto.
   */
  private async notificarAutoTransicionSprint(sprint: Sprint, nuevoEstado: SprintEstado): Promise<void> {
    try {
      const accion = nuevoEstado === SprintEstado.EN_PROGRESO ? 'iniciado' : 'finalizado';

      if (sprint.proyectoId) {
        const proyecto = await this.proyectoRepository.findOne({
          where: { id: sprint.proyectoId },
        });
        if (!proyecto) return;

        const destinatarios: number[] = [];
        if (proyecto.coordinadorId) destinatarios.push(proyecto.coordinadorId);
        if (proyecto.scrumMasterId && proyecto.scrumMasterId !== proyecto.coordinadorId) {
          destinatarios.push(proyecto.scrumMasterId);
        }
        if (destinatarios.length === 0) return;

        await this.notificacionService.notificarMultiples(
          TipoNotificacion.SPRINTS,
          destinatarios,
          {
            titulo: `Sprint ${accion} automáticamente: ${sprint.nombre}`,
            descripcion: `El sprint "${sprint.nombre}" del proyecto "${proyecto.nombre}" ha sido ${accion} automáticamente.`,
            entidadTipo: 'Sprint',
            entidadId: sprint.id,
            proyectoId: proyecto.id,
            urlAccion: `/poi/proyecto/detalles?id=${proyecto.id}&tab=Backlog`,
          },
        );
      } else if (sprint.subproyectoId) {
        const subproyecto = await this.tareaRepository.manager.findOne(Subproyecto, {
          where: { id: sprint.subproyectoId },
        });
        if (!subproyecto) return;

        const destinatarios: number[] = [];
        if (subproyecto.coordinadorId) destinatarios.push(subproyecto.coordinadorId);
        if (subproyecto.scrumMasterId && subproyecto.scrumMasterId !== subproyecto.coordinadorId) {
          destinatarios.push(subproyecto.scrumMasterId);
        }
        if (destinatarios.length === 0) return;

        await this.notificacionService.notificarMultiples(
          TipoNotificacion.SPRINTS,
          destinatarios,
          {
            titulo: `Sprint ${accion} automáticamente: ${sprint.nombre}`,
            descripcion: `El sprint "${sprint.nombre}" del subproyecto "${subproyecto.nombre}" ha sido ${accion} automáticamente.`,
            entidadTipo: 'Sprint',
            entidadId: sprint.id,
            urlAccion: `/poi/subproyecto/detalles?id=${subproyecto.id}&tab=Backlog`,
          },
        );
      }

      console.log(`[Sprint ${sprint.nombre}] Notificación de auto-transición enviada (${accion})`);
    } catch (error) {
      console.error(`[Sprint ${sprint.nombre}] Error enviando notificación de auto-transición:`, error);
    }
  }

  /**
   * Verifica si todos los sprints del proyecto están finalizados
   * y notifica al equipo para que considere finalizar el proyecto.
   */
  private async verificarSprintsCompletadosDesdeAutoTransicion(proyectoId: number): Promise<void> {
    try {
      const sprintsNoFinalizados = await this.sprintRepository.count({
        where: {
          proyectoId,
          estado: In([SprintEstado.POR_HACER, SprintEstado.EN_PROGRESO]),
          activo: true,
        },
      });

      if (sprintsNoFinalizados > 0) return;

      const sprintsFinalizados = await this.sprintRepository.count({
        where: {
          proyectoId,
          estado: SprintEstado.FINALIZADO,
          activo: true,
        },
      });

      if (sprintsFinalizados === 0) return;

      const proyecto = await this.proyectoRepository.findOne({
        where: { id: proyectoId },
      });

      if (!proyecto || proyecto.estado === 'Finalizado') return;

      const destinatarios: number[] = [];
      if (proyecto.coordinadorId) destinatarios.push(proyecto.coordinadorId);
      if (proyecto.scrumMasterId && proyecto.scrumMasterId !== proyecto.coordinadorId) {
        destinatarios.push(proyecto.scrumMasterId);
      }

      if (destinatarios.length === 0) return;

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        destinatarios,
        {
          titulo: `¿Finalizar proyecto ${proyecto.codigo}?`,
          descripcion: `Todos los sprints del proyecto "${proyecto.nombre}" han sido completados. ¿Desea marcar el proyecto como Finalizado?`,
          entidadTipo: 'Proyecto',
          entidadId: proyectoId,
          proyectoId: proyectoId,
          urlAccion: `/poi/proyecto/detalles?id=${proyectoId}&tab=Backlog`,
        },
      );

      console.log(`[Proyecto ${proyecto.codigo}] Todos los sprints finalizados. Notificación enviada.`);
    } catch (error) {
      console.error(`[Proyecto ID:${proyectoId}] Error verificando sprints completados:`, error);
    }
  }

  /**
   * Verifica si todos los sprints de un subproyecto están finalizados (vía auto-transición)
   * y notifica al equipo para que considere finalizar el subproyecto.
   */
  private async verificarSprintsCompletadosSubproyectoDesdeAutoTransicion(subproyectoId: number): Promise<void> {
    try {
      const sprintsNoFinalizados = await this.sprintRepository.count({
        where: {
          subproyectoId,
          estado: In([SprintEstado.POR_HACER, SprintEstado.EN_PROGRESO]),
          activo: true,
        },
      });

      if (sprintsNoFinalizados > 0) return;

      const sprintsFinalizados = await this.sprintRepository.count({
        where: {
          subproyectoId,
          estado: SprintEstado.FINALIZADO,
          activo: true,
        },
      });

      if (sprintsFinalizados === 0) return;

      const subproyecto = await this.tareaRepository.manager.findOne(Subproyecto, {
        where: { id: subproyectoId },
      });

      if (!subproyecto || subproyecto.estado === 'Finalizado') return;

      const destinatarios: number[] = [];
      if (subproyecto.coordinadorId) destinatarios.push(subproyecto.coordinadorId);
      if (subproyecto.scrumMasterId && subproyecto.scrumMasterId !== subproyecto.coordinadorId) {
        destinatarios.push(subproyecto.scrumMasterId);
      }

      if (destinatarios.length === 0) return;

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        destinatarios,
        {
          titulo: `¿Finalizar subproyecto ${subproyecto.codigo}?`,
          descripcion: `Todos los sprints del subproyecto "${subproyecto.nombre}" han sido completados. ¿Desea marcar el subproyecto como Finalizado?`,
          entidadTipo: 'Subproyecto',
          entidadId: subproyectoId,
          urlAccion: `/poi/subproyecto/detalles?id=${subproyectoId}&tab=Backlog`,
        },
      );

      console.log(`[Subproyecto ${subproyecto.codigo}] Todos los sprints finalizados. Notificación enviada.`);
    } catch (error) {
      console.error(`[Subproyecto ID:${subproyectoId}] Error verificando sprints completados:`, error);
    }
  }

  // ================================================================
  // Métodos de Recálculo de Estado KANBAN
  // ================================================================

  /**
   * Recalcula el estado de una tarea KANBAN basándose en el estado de sus subtareas.
   * Lógica:
   * - Sin subtareas activas → "Por hacer"
   * - Todas finalizadas → Generar PDF de evidencias y marcar como "Finalizado"
   * - Alguna subtarea activa pero no todas finalizadas → "En progreso"
   *
   * Este método es público para que SubtareaService pueda llamarlo.
   */
  async recalcularEstadoTareaKanban(tareaId: number, userId?: number): Promise<void> {
    const tarea = await this.tareaRepository.findOne({
      where: { id: tareaId },
    });

    if (!tarea || tarea.tipo !== TareaTipo.KANBAN) {
      console.log(`[KANBAN] recalcularEstadoTareaKanban: Tarea ${tareaId} no es KANBAN o no existe. Ignorando.`);
      return;
    }

    const subtareas = await this.subtareaRepository.find({
      where: { tareaId, activo: true },
    });

    console.log(`[KANBAN Tarea ${tarea.codigo}] Recalculando estado. Subtareas activas: ${subtareas.length}`);

    if (subtareas.length === 0) {
      // Sin subtareas → "Por hacer"
      if (tarea.estado !== TareaEstado.POR_HACER) {
        const estadoAnterior = tarea.estado;
        tarea.estado = TareaEstado.POR_HACER;
        tarea.updatedBy = userId;
        await this.tareaRepository.save(tarea);

        console.log(`[KANBAN Tarea ${tarea.codigo}] Sin subtareas → Estado: "${estadoAnterior}" → "Por hacer"`);

        if (userId) {
          await this.historialCambioService.registrarCambioEstado(
            HistorialEntidadTipo.TAREA,
            tareaId,
            estadoAnterior,
            TareaEstado.POR_HACER,
            userId,
          );
        }
      }
      return;
    }

    const todasFinalizadas = subtareas.every(s => s.estado === TareaEstado.FINALIZADO);

    if (todasFinalizadas) {
      console.log(`[KANBAN Tarea ${tarea.codigo}] Todas las subtareas finalizadas. Generando documento de evidencias...`);

      // Generar PDF de evidencias consolidado
      await this.generarDocumentoEvidenciasKanban(tareaId);

      // Marcar tarea como finalizada
      if (tarea.estado !== TareaEstado.FINALIZADO) {
        const estadoAnterior = tarea.estado;
        tarea.estado = TareaEstado.FINALIZADO;
        tarea.fechaCompletado = new Date();
        tarea.updatedBy = userId;
        await this.tareaRepository.save(tarea);

        console.log(`[KANBAN Tarea ${tarea.codigo}] Todas subtareas finalizadas → Estado: "${estadoAnterior}" → "Finalizado"`);

        if (userId) {
          await this.historialCambioService.registrarCambioEstado(
            HistorialEntidadTipo.TAREA,
            tareaId,
            estadoAnterior,
            TareaEstado.FINALIZADO,
            userId,
          );
        }

        // Notificar al coordinador/gestor de la actividad
        if (tarea.actividadId) {
          await this.notificarTareaKanbanFinalizada(tarea, userId);
        }
      }
    } else {
      // Hay subtareas pero no todas finalizadas → "En progreso"
      if (tarea.estado !== TareaEstado.EN_PROGRESO) {
        const estadoAnterior = tarea.estado;
        tarea.estado = TareaEstado.EN_PROGRESO;
        tarea.updatedBy = userId;
        if (!tarea.fechaInicioProgreso) {
          tarea.fechaInicioProgreso = new Date();
        }
        await this.tareaRepository.save(tarea);

        console.log(`[KANBAN Tarea ${tarea.codigo}] Subtareas parciales → Estado: "${estadoAnterior}" → "En progreso"`);

        if (userId) {
          await this.historialCambioService.registrarCambioEstado(
            HistorialEntidadTipo.TAREA,
            tareaId,
            estadoAnterior,
            TareaEstado.EN_PROGRESO,
            userId,
          );
        }
      }
    }
  }

  /**
   * Genera un documento PDF consolidado con las evidencias de todas las subtareas
   * de una tarea KANBAN. El PDF se sube a MinIO y la URL se guarda en la tarea.
   *
   * Reutiliza el HuEvidenciaPdfService transformando las subtareas en un formato
   * compatible con "tareas + evidencias" que el servicio espera.
   */
  private async generarDocumentoEvidenciasKanban(tareaId: number): Promise<void> {
    try {
      const tarea = await this.tareaRepository.findOne({
        where: { id: tareaId },
        relations: ['asignado'],
      });

      if (!tarea) return;

      // Obtener subtareas activas
      const subtareas = await this.subtareaRepository.find({
        where: { tareaId, activo: true },
        relations: ['responsable'],
        order: { orden: 'ASC', codigo: 'ASC' },
      });

      if (subtareas.length === 0) return;

      // Cargar evidencias de cada subtarea desde la tabla evidencias_subtarea
      const evidenciaSubtareaRepo = this.subtareaRepository.manager.getRepository('agile.evidencias_subtarea');

      // Construir datos compatibles con HuEvidenciaPdfService
      // Cada subtarea se mapea como si fuera una "tarea" con sus "evidencias"
      const tareasConEvidencias: Array<{ tarea: any; evidencias: any[] }> = [];
      for (const subtarea of subtareas) {
        const evidencias = await this.subtareaRepository.manager
          .query(
            `SELECT es.*, u.nombre as usuario_nombre, u.apellido as usuario_apellido
             FROM agile.evidencias_subtarea es
             LEFT JOIN usuarios u ON u.id = es.subido_por
             WHERE es.subtarea_id = $1
             ORDER BY es.created_at ASC`,
            [subtarea.id],
          );

        tareasConEvidencias.push({
          tarea: {
            id: subtarea.id,
            codigo: subtarea.codigo,
            nombre: subtarea.nombre,
            descripcion: subtarea.descripcion,
            estado: subtarea.estado,
            prioridad: subtarea.prioridad,
            fechaFin: subtarea.fechaFin,
            asignado: subtarea.responsable || tarea.asignado,
          },
          evidencias: evidencias.map((ev: any) => ({
            id: ev.id,
            nombre: ev.nombre,
            descripcion: ev.descripcion,
            url: ev.url,
            tipo: ev.tipo,
            tamanoBytes: ev.tamano_bytes,
            createdAt: ev.created_at,
            usuario: ev.usuario_nombre ? {
              nombre: ev.usuario_nombre,
              apellido: ev.usuario_apellido,
            } : null,
          })),
        });
      }

      // Obtener info de la actividad para el nombre del archivo
      let actividadCodigo = 'ACT';
      let actividadNombre = '';
      if (tarea.actividadId) {
        const actividad = await this.actividadRepository.findOne({
          where: { id: tarea.actividadId },
          select: ['id', 'codigo', 'nombre'],
        });
        if (actividad) {
          actividadCodigo = actividad.codigo;
          actividadNombre = actividad.nombre;
        }
      }

      // Verificar que hay al menos una evidencia tipo imagen
      const totalEvidencias = tareasConEvidencias.reduce((sum, t) => sum + t.evidencias.length, 0);
      if (totalEvidencias === 0) {
        console.log(`[KANBAN Tarea ${tarea.codigo}] No hay evidencias en subtareas, omitiendo generación de PDF.`);
        return;
      }

      // Generar un PDF simple con pdfmake directamente (sin depender de HuEvidenciaPdfService
      // que requiere un historiaUsuarioId válido)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const PdfPrinter = require('pdfmake/src/printer');
      const fonts = {
        Helvetica: {
          normal: 'Helvetica',
          bold: 'Helvetica-Bold',
          italics: 'Helvetica-Oblique',
          bolditalics: 'Helvetica-BoldOblique',
        },
      };
      const printer = new PdfPrinter(fonts);

      // Construir contenido del PDF
      const content: any[] = [
        {
          text: `Evidencias - Tarea ${tarea.codigo}`,
          fontSize: 16,
          bold: true,
          alignment: 'center',
          margin: [0, 0, 0, 10],
        },
        {
          text: tarea.nombre,
          fontSize: 12,
          alignment: 'center',
          margin: [0, 0, 0, 5],
        },
        {
          text: actividadNombre ? `Actividad: ${actividadCodigo} - ${actividadNombre}` : '',
          fontSize: 10,
          alignment: 'center',
          color: '#666666',
          margin: [0, 0, 0, 15],
        },
      ];

      // Agregar resumen de subtareas
      for (const { tarea: sub, evidencias } of tareasConEvidencias) {
        content.push({
          text: `${sub.codigo} - ${sub.nombre}`,
          fontSize: 11,
          bold: true,
          margin: [0, 10, 0, 3],
        });

        if (sub.descripcion) {
          content.push({
            text: sub.descripcion,
            fontSize: 9,
            italics: true,
            margin: [0, 0, 0, 3],
          });
        }

        content.push({
          text: `Estado: ${sub.estado} | Evidencias: ${evidencias.length}`,
          fontSize: 9,
          color: '#666666',
          margin: [0, 0, 0, 5],
        });

        // Listar evidencias
        for (const ev of evidencias) {
          content.push({
            text: `  - ${ev.nombre}${ev.descripcion ? ': ' + ev.descripcion : ''}`,
            fontSize: 9,
            margin: [10, 0, 0, 2],
          });
        }
      }

      content.push({
        text: `\nGenerado el ${new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
        fontSize: 8,
        color: '#999999',
        alignment: 'right',
        margin: [0, 20, 0, 0],
      });

      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [40, 40, 40, 40],
        content,
        defaultStyle: { font: 'Helvetica' },
      };

      // Generar PDF buffer
      const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
        try {
          const pdfDoc = printer.createPdfKitDocument(docDefinition);
          const chunks: Buffer[] = [];
          pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
          pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
          pdfDoc.on('error', (err: Error) => reject(err));
          pdfDoc.end();
        } catch (error) {
          reject(error);
        }
      });

      // Subir PDF a MinIO
      const bucketName = this.configService.get('minio.buckets.documentos', 'sigp-documentos');
      const objectKey = `evidencias/kanban/${tarea.codigo}_evidencias_${Date.now()}.pdf`;

      await this.minioService.putObject(
        bucketName,
        objectKey,
        pdfBuffer,
        pdfBuffer.length,
        { 'Content-Type': 'application/pdf' },
      );

      // Generar URL de descarga (7 días)
      const pdfUrl = await this.minioService.getPresignedGetUrl(bucketName, objectKey, 7 * 24 * 60 * 60);

      // Actualizar tarea con la URL del documento
      await this.tareaRepository.update(tareaId, {
        documentoEvidenciasUrl: pdfUrl,
      });

      console.log(`[KANBAN Tarea ${tarea.codigo}] PDF de evidencias generado: ${objectKey}`);
    } catch (error) {
      console.error(`[KANBAN Tarea ID:${tareaId}] Error generando documento de evidencias:`, error);
      // No fallar la operación principal por un error en la generación del PDF
    }
  }

  /**
   * Notifica al coordinador/gestor de la actividad cuando una tarea KANBAN
   * se finaliza automáticamente por tener todas sus subtareas completadas.
   */
  private async notificarTareaKanbanFinalizada(tarea: Tarea, userId?: number): Promise<void> {
    try {
      const actividad = await this.actividadRepository.findOne({
        where: { id: tarea.actividadId },
        select: ['id', 'codigo', 'nombre', 'coordinadorId', 'gestorId'],
      });

      if (!actividad) return;

      const destinatarios: number[] = [];

      if (actividad.coordinadorId && actividad.coordinadorId !== userId) {
        destinatarios.push(actividad.coordinadorId);
      }
      if (actividad.gestorId && actividad.gestorId !== userId && actividad.gestorId !== actividad.coordinadorId) {
        destinatarios.push(actividad.gestorId);
      }

      if (destinatarios.length === 0) return;

      const urlAccion = await this.buildTareaUrlAccion(tarea);

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.TAREAS,
        destinatarios,
        {
          titulo: `Tarea completada: ${tarea.codigo}`,
          descripcion: `La tarea "${tarea.nombre}" de la actividad "${actividad.nombre}" ha sido finalizada automáticamente. Todas sus subtareas están completas.`,
          entidadTipo: 'Tarea',
          entidadId: tarea.id,
          actividadId: tarea.actividadId,
          urlAccion,
        },
      );

      console.log(`[KANBAN Tarea ${tarea.codigo}] Notificación de finalización enviada a gestores.`);
    } catch (error) {
      console.error(`[KANBAN Tarea ${tarea.codigo}] Error enviando notificación de finalización:`, error);
    }
  }

  /**
   * Recalcula el estado de una actividad basándose en el estado de sus tareas.
   * Transiciones:
   * - Pendiente → En desarrollo: Cuando se crea la primera tarea
   * - En desarrollo → (mantener): Cuando hay tareas pero no todas están finalizadas
   * - Finalizado: Solo se cambia manualmente desde el frontend con modal de confirmación
   */
  async recalcularEstadoActividad(actividadId: number, userId?: number): Promise<void> {
    const actividad = await this.actividadRepository.findOne({
      where: { id: actividadId },
      select: ['id', 'codigo', 'nombre', 'estado', 'coordinadorId', 'gestorId'],
    });

    if (!actividad) {
      console.log(`[Actividad ${actividadId}] No encontrada, no se puede recalcular estado.`);
      return;
    }

    const estadoAnterior = actividad.estado;

    // Obtener todas las tareas activas de la actividad
    const tareas = await this.tareaRepository.find({
      where: { actividadId, activo: true, tipo: TareaTipo.KANBAN },
      select: ['id', 'estado'],
    });

    const totalTareas = tareas.length;

    // Si hay tareas y la actividad está en Pendiente → cambiar a En desarrollo
    if (totalTareas > 0 && estadoAnterior === 'Pendiente') {
      actividad.estado = 'En desarrollo' as any;
      await this.actividadRepository.save(actividad);

      console.log(
        `[Actividad ${actividad.codigo}] Estado cambiado de "${estadoAnterior}" a "En desarrollo" (primera tarea creada)`,
      );

      // Notificar a coordinador y gestor
      const destinatarios = [actividad.coordinadorId, actividad.gestorId].filter(
        (id): id is number => id !== null && id !== undefined,
      );

      if (destinatarios.length > 0) {
        await this.notificacionService.notificarMultiples(
          TipoNotificacion.PROYECTOS,
          destinatarios,
          {
            titulo: `Actividad iniciada: ${actividad.codigo}`,
            descripcion: `La actividad "${actividad.nombre}" ha cambiado a estado "En desarrollo" (se creó la primera tarea).`,
            entidadTipo: 'Actividad',
            entidadId: actividad.id,
            actividadId: actividad.id,
            urlAccion: `/poi/actividad/detalles?id=${actividad.id}`,
          },
        );
      }
    }

    // Verificar si todas las tareas están finalizadas (pero NO cambiar automáticamente)
    // El frontend mostrará un modal para que el usuario decida si finalizar o continuar
    if (totalTareas > 0 && estadoAnterior === 'En desarrollo') {
      const tareasFinalizadas = tareas.filter(t => t.estado === TareaEstado.FINALIZADO).length;

      if (tareasFinalizadas === totalTareas) {
        console.log(
          `[Actividad ${actividad.codigo}] Todas las tareas (${totalTareas}) están finalizadas. ` +
          `El frontend debe mostrar modal de confirmación para finalizar la actividad.`,
        );
        // NO cambiar el estado aquí - el frontend lo hará con el modal
      }
    }
  }
}
