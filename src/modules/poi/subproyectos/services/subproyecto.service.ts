import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Subproyecto } from '../entities/subproyecto.entity';
import { CreateSubproyectoDto } from '../dto/create-subproyecto.dto';
import { UpdateSubproyectoDto } from '../dto/update-subproyecto.dto';
import { CambiarEstadoSubproyectoDto } from '../dto/cambiar-estado-subproyecto.dto';
import { ProyectoEstado } from '../../proyectos/enums/proyecto-estado.enum';
import { NotificacionService } from '../../../notificaciones/services/notificacion.service';
import { TipoNotificacion } from '../../../notificaciones/enums/tipo-notificacion.enum';
import { Proyecto } from '../../proyectos/entities/proyecto.entity';
import { AccionEstrategica } from '../../../planning/acciones-estrategicas/entities/accion-estrategica.entity';
import { Usuario } from '../../../auth/entities/usuario.entity';
import { Role } from '../../../../common/constants/roles.constant';

@Injectable()
export class SubproyectoService {
  private readonly logger = new Logger(SubproyectoService.name);

  constructor(
    @InjectRepository(Subproyecto)
    private readonly subproyectoRepository: Repository<Subproyecto>,
    @InjectRepository(Proyecto)
    private readonly proyectoRepository: Repository<Proyecto>,
    @InjectRepository(AccionEstrategica)
    private readonly accionEstrategicaRepository: Repository<AccionEstrategica>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @Inject(forwardRef(() => NotificacionService))
    private readonly notificacionService: NotificacionService,
  ) {}

  // ==========================================
  // MÉTODOS PRIVADOS - UTILIDADES
  // ==========================================

  /**
   * Obtiene los IDs de todos los usuarios con rol PMO activos
   */
  private async getPmoUserIds(): Promise<number[]> {
    const pmoUsers = await this.usuarioRepository.find({
      where: { rol: Role.PMO, activo: true },
      select: ['id'],
    });
    return pmoUsers.map((u) => u.id);
  }

  /**
   * Verifica si todos los campos requeridos del subproyecto están completos
   * para considerar la transición automática de estado.
   */
  private camposRequeridosCompletos(subproyecto: Subproyecto): boolean {
    return Boolean(
      subproyecto.nombre?.trim() &&
        subproyecto.descripcion?.trim() &&
        subproyecto.clasificacion &&
        subproyecto.coordinadorId &&
        subproyecto.scrumMasterId &&
        (subproyecto.coordinacion || subproyecto.areaResponsable) &&
        subproyecto.areasFinancieras &&
        subproyecto.areasFinancieras.length > 0 &&
        subproyecto.fechaInicio &&
        subproyecto.fechaFin &&
        subproyecto.anios &&
        subproyecto.anios.length > 0,
    );
  }

  /**
   * Convierte una fecha string (YYYY-MM-DD) a Date evitando problemas de timezone.
   */
  private parseDateString(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  /**
   * Valida que las fechas del subproyecto estén dentro del rango del PGD
   * (se obtiene el PGD a través del proyecto padre → AE → PGD)
   */
  private async validateFechasEnRangoPGD(
    proyectoPadreId: number,
    fechaInicio: string,
    fechaFin: string,
  ): Promise<void> {
    // Obtener proyecto padre con su AE
    const proyecto = await this.proyectoRepository.findOne({
      where: { id: proyectoPadreId },
      relations: ['accionEstrategica'],
    });

    if (!proyecto) {
      throw new NotFoundException(`Proyecto padre con ID ${proyectoPadreId} no encontrado`);
    }

    if (!proyecto.accionEstrategicaId) {
      // Si el proyecto padre no tiene AE, no hay restricción de fechas
      return;
    }

    // Cargar AE completa con sus relaciones hacia el PGD
    const accionEstrategica = await this.accionEstrategicaRepository.findOne({
      where: { id: proyecto.accionEstrategicaId },
      relations: ['oegd', 'oegd.ogd', 'oegd.ogd.pgd'],
    });

    if (!accionEstrategica || !accionEstrategica.oegd?.ogd?.pgd) {
      // Si no hay PGD vinculado, no validamos
      return;
    }

    const pgd = accionEstrategica.oegd.ogd.pgd;
    const fechaInicioSub = this.parseDateString(fechaInicio);
    const fechaFinSub = this.parseDateString(fechaFin);

    // El PGD tiene anioInicio y anioFin
    const pgdFechaInicio = new Date(pgd.anioInicio, 0, 1, 12, 0, 0); // 1 enero
    const pgdFechaFin = new Date(pgd.anioFin, 11, 31, 12, 0, 0); // 31 diciembre

    if (fechaInicioSub < pgdFechaInicio || fechaFinSub > pgdFechaFin) {
      throw new BadRequestException(
        `Las fechas del subproyecto deben estar dentro del rango del PGD (${pgd.anioInicio} - ${pgd.anioFin})`,
      );
    }
  }

  /**
   * Valida que las fechas del subproyecto estén dentro del rango de fechas del proyecto padre.
   */
  private validateFechasEnRangoProyecto(
    proyectoPadre: Proyecto,
    fechaInicio: string,
    fechaFin: string,
  ): void {
    if (!proyectoPadre.fechaInicio || !proyectoPadre.fechaFin) {
      return; // Sin restricción si el proyecto padre no tiene fechas definidas
    }

    // Normalizar a YYYY-MM-DD (TypeORM 'date' puede retornar string o Date)
    const padInicio = String(proyectoPadre.fechaInicio).split('T')[0];
    const padFin = String(proyectoPadre.fechaFin).split('T')[0];

    if (fechaInicio < padInicio || fechaFin > padFin) {
      throw new BadRequestException(
        `Las fechas del subproyecto deben estar dentro del rango del proyecto padre: ${padInicio} a ${padFin}`,
      );
    }
  }

  /**
   * Valida que los años del subproyecto estén dentro del rango del PGD
   */
  private async validateAniosEnRangoPGD(proyectoPadreId: number, anios: number[]): Promise<void> {
    // Obtener proyecto padre con su AE
    const proyecto = await this.proyectoRepository.findOne({
      where: { id: proyectoPadreId },
      relations: ['accionEstrategica'],
    });

    if (!proyecto) {
      throw new NotFoundException(`Proyecto padre con ID ${proyectoPadreId} no encontrado`);
    }

    if (!proyecto.accionEstrategicaId) {
      // Si el proyecto padre no tiene AE, no hay restricción
      return;
    }

    // Cargar AE con PGD
    const accionEstrategica = await this.accionEstrategicaRepository.findOne({
      where: { id: proyecto.accionEstrategicaId },
      relations: ['oegd', 'oegd.ogd', 'oegd.ogd.pgd'],
    });

    if (!accionEstrategica || !accionEstrategica.oegd?.ogd?.pgd) {
      return;
    }

    const pgd = accionEstrategica.oegd.ogd.pgd;

    for (const anio of anios) {
      if (anio < pgd.anioInicio || anio > pgd.anioFin) {
        throw new BadRequestException(
          `El año ${anio} está fuera del rango del PGD (${pgd.anioInicio} - ${pgd.anioFin})`,
        );
      }
    }
  }

  // ==========================================
  // MÉTODOS PRIVADOS - NOTIFICACIONES
  // ==========================================

  /**
   * Notificar la creación de un nuevo subproyecto a los stakeholders
   */
  private async notificarCreacion(subproyecto: Subproyecto, userId?: number): Promise<void> {
    const destinatarios: number[] = [];

    // Coordinador
    if (subproyecto.coordinadorId && subproyecto.coordinadorId !== userId) {
      destinatarios.push(subproyecto.coordinadorId);
    }

    // Scrum Master
    if (subproyecto.scrumMasterId && subproyecto.scrumMasterId !== userId) {
      destinatarios.push(subproyecto.scrumMasterId);
    }

    // Área usuaria (patrocinador)
    if (subproyecto.areaUsuariaId && subproyecto.areaUsuariaId !== userId) {
      destinatarios.push(subproyecto.areaUsuariaId);
    }

    // PMO
    const pmoIds = await this.getPmoUserIds();
    destinatarios.push(...pmoIds);

    // Eliminar duplicados
    const uniqueDestinatarios = [...new Set(destinatarios)];

    // Enviar notificación
    if (uniqueDestinatarios.length > 0) {
      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        uniqueDestinatarios,
        {
          titulo: `Nuevo Subproyecto: ${subproyecto.codigo}`,
          descripcion: `Se ha creado el subproyecto "${subproyecto.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: subproyecto.id,
          proyectoId: subproyecto.proyectoPadreId,
        },
      );
    }
  }

  /**
   * Notificar cambios en roles del subproyecto
   */
  private async notificarCambiosRoles(
    subproyecto: Subproyecto,
    rolesChanged: { coordinador?: boolean; scrumMaster?: boolean; patrocinador?: boolean },
    userId?: number,
  ): Promise<void> {
    const pmoIds = await this.getPmoUserIds();

    // Notificar cambio de coordinador
    if (rolesChanged.coordinador && subproyecto.coordinadorId && subproyecto.coordinadorId !== userId) {
      const destinatarios = [subproyecto.coordinadorId, ...pmoIds];
      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        destinatarios,
        {
          titulo: `Asignación: Coordinador de ${subproyecto.codigo}`,
          descripcion: `Has sido asignado como coordinador del subproyecto "${subproyecto.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: subproyecto.id,
          proyectoId: subproyecto.proyectoPadreId,
        },
      );
    }

    // Notificar cambio de Scrum Master
    if (rolesChanged.scrumMaster && subproyecto.scrumMasterId && subproyecto.scrumMasterId !== userId) {
      const destinatarios = [subproyecto.scrumMasterId, ...pmoIds];
      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        destinatarios,
        {
          titulo: `Asignación: Scrum Master de ${subproyecto.codigo}`,
          descripcion: `Has sido asignado como Scrum Master del subproyecto "${subproyecto.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: subproyecto.id,
          proyectoId: subproyecto.proyectoPadreId,
        },
      );
    }
  }

  /**
   * Notificar cambio de estado del subproyecto
   */
  private async notificarCambioEstado(
    subproyecto: Subproyecto,
    nuevoEstado: ProyectoEstado,
    userId?: number,
  ): Promise<void> {
    const destinatarios: number[] = [];

    // Coordinador
    if (subproyecto.coordinadorId && subproyecto.coordinadorId !== userId) {
      destinatarios.push(subproyecto.coordinadorId);
    }

    // Scrum Master
    if (subproyecto.scrumMasterId && subproyecto.scrumMasterId !== userId) {
      destinatarios.push(subproyecto.scrumMasterId);
    }

    // PMO
    const pmoIds = await this.getPmoUserIds();
    destinatarios.push(...pmoIds);

    // Eliminar duplicados
    const uniqueDestinatarios = [...new Set(destinatarios)];

    // Mensaje según el estado
    let descripcion = `El subproyecto "${subproyecto.nombre}" ha cambiado al estado: ${nuevoEstado}`;

    if (nuevoEstado === ProyectoEstado.FINALIZADO) {
      descripcion = `El subproyecto "${subproyecto.nombre}" ha sido finalizado`;
    } else if (nuevoEstado === ProyectoEstado.CANCELADO) {
      descripcion = `El subproyecto "${subproyecto.nombre}" ha sido cancelado`;
    }

    if (uniqueDestinatarios.length > 0) {
      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        uniqueDestinatarios,
        {
          titulo: `Cambio de estado: ${subproyecto.codigo}`,
          descripcion,
          entidadTipo: 'Proyecto',
          entidadId: subproyecto.id,
          proyectoId: subproyecto.proyectoPadreId,
        },
      );
    }
  }

  // ==========================================
  // MÉTODOS PÚBLICOS - CRUD
  // ==========================================

  /**
   * Crear un nuevo subproyecto
   */
  async create(createDto: CreateSubproyectoDto, userId?: number): Promise<Subproyecto> {
    // 1. Validar que el proyecto padre existe
    const proyectoPadre = await this.proyectoRepository.findOne({
      where: { id: createDto.proyectoPadreId, activo: true },
    });

    if (!proyectoPadre) {
      throw new NotFoundException(
        `Proyecto padre con ID ${createDto.proyectoPadreId} no encontrado`,
      );
    }

    // 2. Generar código automático si no se proporciona
    const codigo = createDto.codigo || (await this.getNextCodigo(createDto.proyectoPadreId));

    // 3. Validar que el código no esté duplicado en este proyecto
    const existing = await this.subproyectoRepository.findOne({
      where: { proyectoPadreId: createDto.proyectoPadreId, codigo },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un subproyecto con el código ${codigo} en este proyecto`,
      );
    }

    // 4. Validar fechas (si tiene fechas)
    if (createDto.fechaInicio && createDto.fechaFin) {
      // Validar que fechaFin >= fechaInicio
      const inicio = this.parseDateString(createDto.fechaInicio);
      const fin = this.parseDateString(createDto.fechaFin);

      if (fin < inicio) {
        throw new BadRequestException('La fecha de fin debe ser posterior a la fecha de inicio');
      }

      // Validar dentro del rango del proyecto padre
      this.validateFechasEnRangoProyecto(proyectoPadre, createDto.fechaInicio, createDto.fechaFin);

      // Validar contra PGD
      await this.validateFechasEnRangoPGD(
        createDto.proyectoPadreId,
        createDto.fechaInicio,
        createDto.fechaFin,
      );
    }

    // 5. Validar años contra PGD (si tiene años)
    if (createDto.anios && createDto.anios.length > 0) {
      await this.validateAniosEnRangoPGD(createDto.proyectoPadreId, createDto.anios);
    }

    // 6. Crear subproyecto
    const subproyecto = this.subproyectoRepository.create({
      ...createDto,
      codigo,
      createdBy: userId,
      updatedBy: userId,
    });

    const saved = await this.subproyectoRepository.save(subproyecto);

    // 7. Notificar stakeholders
    await this.notificarCreacion(saved, userId);

    // 8. Retornar con relaciones cargadas
    return this.findOne(saved.id);
  }

  /**
   * Actualizar subproyecto
   */
  async update(
    id: number,
    updateDto: UpdateSubproyectoDto,
    userId?: number,
  ): Promise<Subproyecto> {
    this.logger.log(`🔍 DEBUG - UpdateDto recibido: ${JSON.stringify(updateDto)}`);
    this.logger.log(`🔍 DEBUG - coordinadorId en DTO: ${updateDto.coordinadorId}`);

    const subproyecto = await this.findOne(id);
    this.logger.log(`🔍 DEBUG - Subproyecto actual coordinadorId: ${subproyecto.coordinadorId}`);

    // 1. Validar fechas si se actualizan
    if (updateDto.fechaInicio || updateDto.fechaFin) {
      const fechaInicio =
        updateDto.fechaInicio || String(subproyecto.fechaInicio || '').split('T')[0] || undefined;
      const fechaFin =
        updateDto.fechaFin || String(subproyecto.fechaFin || '').split('T')[0] || undefined;

      if (fechaInicio && fechaFin) {
        // Validar que fechaFin >= fechaInicio
        const inicio = this.parseDateString(fechaInicio);
        const fin = this.parseDateString(fechaFin);

        if (fin < inicio) {
          throw new BadRequestException(
            'La fecha de fin debe ser posterior a la fecha de inicio',
          );
        }

        // Cargar proyecto padre para validar rango
        const proyectoPadre = await this.proyectoRepository.findOne({
          where: { id: subproyecto.proyectoPadreId },
        });

        if (proyectoPadre) {
          this.validateFechasEnRangoProyecto(proyectoPadre, fechaInicio, fechaFin);
        }

        await this.validateFechasEnRangoPGD(subproyecto.proyectoPadreId, fechaInicio, fechaFin);
      }
    }

    // 2. Validar años si se actualizan
    if (updateDto.anios && updateDto.anios.length > 0) {
      await this.validateAniosEnRangoPGD(subproyecto.proyectoPadreId, updateDto.anios);
    }

    // 3. Detectar cambios en roles para notificar
    const rolesChanged = {
      coordinador:
        updateDto.coordinadorId !== undefined &&
        updateDto.coordinadorId !== subproyecto.coordinadorId,
      scrumMaster:
        updateDto.scrumMasterId !== undefined &&
        updateDto.scrumMasterId !== subproyecto.scrumMasterId,
    };

    // 4. Actualizar usando update() del repositorio
    // CRÍTICO: Usar update() en vez de save() para evitar problemas con relaciones
    // TypeORM prioriza las relaciones sobre los campos de ID cuando se usa save()
    // update() trabaja directamente con los campos de la BD

    // Preparar datos para actualización
    const updateData: any = {
      updatedBy: userId,
    };

    // Asignar solo campos presentes en el DTO
    if (updateDto.nombre !== undefined) updateData.nombre = updateDto.nombre;
    if (updateDto.descripcion !== undefined) updateData.descripcion = updateDto.descripcion;
    if (updateDto.clasificacion !== undefined) updateData.clasificacion = updateDto.clasificacion;
    if (updateDto.coordinadorId !== undefined) updateData.coordinadorId = updateDto.coordinadorId;
    if (updateDto.scrumMasterId !== undefined) updateData.scrumMasterId = updateDto.scrumMasterId;
    if (updateDto.areaUsuariaId !== undefined) updateData.areaUsuaria = updateDto.areaUsuariaId;
    if (updateDto.coordinacion !== undefined) updateData.coordinacion = updateDto.coordinacion;
    if (updateDto.areaResponsable !== undefined) updateData.areaResponsable = updateDto.areaResponsable;
    if (updateDto.areasFinancieras !== undefined) updateData.areasFinancieras = updateDto.areasFinancieras;
    if (updateDto.monto !== undefined) updateData.monto = updateDto.monto;
    if (updateDto.anios !== undefined) updateData.anios = updateDto.anios;
    if (updateDto.costosAnuales !== undefined) updateData.costosAnuales = updateDto.costosAnuales;
    if (updateDto.alcances !== undefined) updateData.alcances = updateDto.alcances;
    if (updateDto.problematica !== undefined) updateData.problematica = updateDto.problematica;
    if (updateDto.beneficiarios !== undefined) updateData.beneficiarios = updateDto.beneficiarios;
    if (updateDto.beneficios !== undefined) updateData.beneficios = updateDto.beneficios;
    if (updateDto.fechaInicio !== undefined) updateData.fechaInicio = this.parseDateString(updateDto.fechaInicio);
    if (updateDto.fechaFin !== undefined) updateData.fechaFin = this.parseDateString(updateDto.fechaFin);
    if (updateDto.estado !== undefined) updateData.estado = updateDto.estado;
    if (updateDto.activo !== undefined) updateData.activo = updateDto.activo;

    this.logger.log(`🔍 DEBUG - coordinadorId en updateData: ${updateData.coordinadorId}`);

    // Usar update() del repositorio para evitar conflictos con relaciones
    await this.subproyectoRepository.update(id, updateData);

    // Recargar el subproyecto con las relaciones actualizadas
    let saved = await this.findOne(id);
    this.logger.log(`🔍 DEBUG - Subproyecto después de update(), coordinadorId: ${saved.coordinadorId}`);

    // 5. Auto-transición de estado (si campos completos y estado es Pendiente)
    if (saved.estado === ProyectoEstado.PENDIENTE && this.camposRequeridosCompletos(saved)) {
      // TODO: Verificar si tiene sprints (requiere integración con módulo Agile)
      // Por ahora, asumimos que si no tiene sprints pasa a "En planificacion"
      const tieneSprints = false; // Placeholder
      const nuevoEstado = tieneSprints
        ? ProyectoEstado.EN_DESARROLLO
        : ProyectoEstado.EN_PLANIFICACION;

      // Usar update() para la auto-transición también
      await this.subproyectoRepository.update(id, { estado: nuevoEstado });
      saved.estado = nuevoEstado;

      this.logger.log(`🔍 DEBUG - Después de auto-transición, estado: ${saved.estado}, coordinadorId: ${saved.coordinadorId}`);

      await this.notificarCambioEstado(saved, nuevoEstado, userId);
    }

    // 6. Notificar al nuevo patrocinador del Área Usuaria
    if (
      updateDto.areaUsuariaId !== undefined &&
      updateDto.areaUsuariaId !== null &&
      updateDto.areaUsuariaId !== subproyecto.areaUsuariaId &&
      updateDto.areaUsuariaId !== userId
    ) {
      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        [updateDto.areaUsuariaId],
        {
          titulo: `Asignado como Área Usuaria: ${subproyecto.codigo}`,
          descripcion: `Se te ha asignado como Área Usuaria del subproyecto "${subproyecto.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: subproyecto.id,
          proyectoId: subproyecto.proyectoPadreId,
        },
      );
    }

    // 7. Notificar cambios en roles
    if (rolesChanged.coordinador || rolesChanged.scrumMaster) {
      await this.notificarCambiosRoles(saved, rolesChanged, userId);
    }

    // IMPORTANTE: Devolver el objeto saved directamente para evitar que findOne()
    // devuelva datos desactualizados antes de que TypeORM haga flush a la BD
    // El findOne() carga relaciones pero puede devolver cache viejo
    return saved;
  }

  /**
   * Cambiar estado del subproyecto
   */
  async cambiarEstado(
    id: number,
    dto: CambiarEstadoSubproyectoDto,
    userId?: number,
  ): Promise<Subproyecto> {
    const subproyecto = await this.findOne(id);

    // Actualizar estado
    subproyecto.estado = dto.nuevoEstado;
    subproyecto.updatedBy = userId;
    await this.subproyectoRepository.save(subproyecto);

    // Notificar cambio de estado
    await this.notificarCambioEstado(subproyecto, dto.nuevoEstado, userId);

    // Si el subproyecto se finaliza, verificar si todos los subproyectos del
    // proyecto padre también están finalizados para notificar al equipo del proyecto
    if (dto.nuevoEstado === ProyectoEstado.FINALIZADO) {
      await this.verificarSubproyectosCompletados(subproyecto.proyectoPadreId);
    }

    return this.findOne(id);
  }

  /**
   * Verifica si todos los subproyectos activos del proyecto padre están finalizados
   * (o cancelados). Si es así, finaliza automáticamente el proyecto padre.
   * Solo aplica cuando el proyecto tiene subproyectos (caso contrario, la finalización
   * del proyecto se maneja por sprints directos).
   */
  private async verificarSubproyectosCompletados(proyectoPadreId: number): Promise<void> {
    // Subproyectos activos que aún no están finalizados ni cancelados
    const subproyectosActivos = await this.subproyectoRepository.count({
      where: {
        proyectoPadreId,
        estado: In([
          ProyectoEstado.PENDIENTE,
          ProyectoEstado.EN_PLANIFICACION,
          ProyectoEstado.EN_DESARROLLO,
        ]),
        activo: true,
      },
    });

    if (subproyectosActivos > 0) return;

    // Debe haber al menos un subproyecto finalizado
    const subproyectosFinalizados = await this.subproyectoRepository.count({
      where: {
        proyectoPadreId,
        estado: ProyectoEstado.FINALIZADO,
        activo: true,
      },
    });

    if (subproyectosFinalizados === 0) return;

    // Obtener el proyecto padre
    const proyecto = await this.proyectoRepository.findOne({
      where: { id: proyectoPadreId },
    });

    if (!proyecto || proyecto.estado === ProyectoEstado.FINALIZADO) return;

    // Auto-finalizar el proyecto padre
    proyecto.estado = ProyectoEstado.FINALIZADO;
    await this.proyectoRepository.save(proyecto);

    // Notificar al equipo que el proyecto fue finalizado automáticamente
    const destinatarios: number[] = [];
    if (proyecto.coordinadorId) destinatarios.push(proyecto.coordinadorId);
    if (proyecto.scrumMasterId && proyecto.scrumMasterId !== proyecto.coordinadorId) {
      destinatarios.push(proyecto.scrumMasterId);
    }

    // Agregar PMOs
    const pmoIds = await this.getPmoUserIds();
    for (const pmoId of pmoIds) {
      if (!destinatarios.includes(pmoId)) {
        destinatarios.push(pmoId);
      }
    }

    if (destinatarios.length > 0) {
      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        destinatarios,
        {
          titulo: `Proyecto finalizado: ${proyecto.codigo}`,
          descripcion: `El proyecto "${proyecto.nombre}" ha sido finalizado automáticamente porque todos sus subproyectos han sido completados.`,
          entidadTipo: 'Proyecto',
          entidadId: proyectoPadreId,
          proyectoId: proyectoPadreId,
          urlAccion: `/poi/proyecto/detalles?id=${proyectoPadreId}`,
        },
      );
    }
  }

  /**
   * Listar subproyectos con filtros y permisos por rol
   */
  async findAll(
    filters?: {
      proyectoPadreId?: number;
      coordinadorId?: number;
      scrumMasterId?: number;
      estado?: ProyectoEstado;
      activo?: boolean;
    },
    userRole?: string,
    userId?: number,
  ): Promise<Subproyecto[]> {
    const queryBuilder = this.subproyectoRepository
      .createQueryBuilder('subproyecto')
      .leftJoinAndSelect('subproyecto.scrumMaster', 'scrumMaster')
      .leftJoinAndSelect('subproyecto.coordinador', 'coordinador')
      .leftJoinAndSelect('subproyecto.patrocinador', 'patrocinador')
      .orderBy('subproyecto.codigo', 'ASC');

    // Filtro por proyecto padre
    if (filters?.proyectoPadreId) {
      queryBuilder.andWhere('subproyecto.proyectoPadreId = :proyectoPadreId', {
        proyectoPadreId: filters.proyectoPadreId,
      });
    }

    // Filtro por estado
    if (filters?.estado) {
      queryBuilder.andWhere('subproyecto.estado = :estado', { estado: filters.estado });
    }

    // Filtro por activo
    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('subproyecto.activo = :activo', { activo: filters.activo });
    }

    // Filtros automáticos por rol
    if (userRole === Role.SCRUM_MASTER && userId) {
      queryBuilder.andWhere('subproyecto.scrumMasterId = :userId', { userId });
    }

    if (userRole === Role.COORDINADOR && userId) {
      queryBuilder.andWhere('subproyecto.coordinadorId = :userId', { userId });
    }

    // Filtros manuales (sobrescriben automáticos si se especifican)
    if (filters?.coordinadorId) {
      queryBuilder.andWhere('subproyecto.coordinadorId = :coordinadorId', {
        coordinadorId: filters.coordinadorId,
      });
    }

    if (filters?.scrumMasterId) {
      queryBuilder.andWhere('subproyecto.scrumMasterId = :scrumMasterId', {
        scrumMasterId: filters.scrumMasterId,
      });
    }

    return queryBuilder.getMany();
  }

  /**
   * Obtener subproyectos de un proyecto específico
   */
  async findByProyecto(proyectoPadreId: number): Promise<Subproyecto[]> {
    return this.subproyectoRepository.find({
      where: { proyectoPadreId, activo: true },
      relations: ['scrumMaster', 'coordinador', 'patrocinador'],
      order: { codigo: 'ASC' },
    });
  }

  /**
   * Obtener un subproyecto por ID
   */
  async findOne(id: number): Promise<Subproyecto> {
    const subproyecto = await this.subproyectoRepository.findOne({
      where: { id },
      relations: ['proyectoPadre', 'scrumMaster', 'coordinador', 'patrocinador'],
    });

    if (!subproyecto) {
      throw new NotFoundException(`Subproyecto con ID ${id} no encontrado`);
    }

    return subproyecto;
  }

  /**
   * Soft delete de subproyecto
   */
  async remove(id: number, userId?: number): Promise<Subproyecto> {
    const subproyecto = await this.findOne(id);
    subproyecto.activo = false;
    subproyecto.updatedBy = userId;
    return this.subproyectoRepository.save(subproyecto);
  }

  /**
   * Genera el siguiente código de subproyecto disponible para un proyecto
   * Formato: SUB-001, SUB-002, etc. (secuencial por proyecto)
   */
  async getNextCodigo(proyectoPadreId: number): Promise<string> {
    const subproyectos = await this.subproyectoRepository.find({
      where: { proyectoPadreId },
      select: ['codigo'],
    });

    let maxNum = 0;
    for (const subproyecto of subproyectos) {
      // Buscar patrón SUB-###
      const match = subproyecto.codigo.match(/SUB-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    return `SUB-${String(maxNum + 1).padStart(3, '0')}`;
  }
}
