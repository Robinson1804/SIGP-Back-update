import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
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

    // Patrocinador
    if (subproyecto.patrocinadorId && subproyecto.patrocinadorId !== userId) {
      destinatarios.push(subproyecto.patrocinadorId);
    }

    // Área usuaria
    if (subproyecto.areaUsuaria && subproyecto.areaUsuaria.length > 0) {
      const areaUsuariaFiltered = subproyecto.areaUsuaria.filter((id) => id !== userId);
      destinatarios.push(...areaUsuariaFiltered);
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

    // Notificar cambio de patrocinador
    if (rolesChanged.patrocinador && subproyecto.patrocinadorId && subproyecto.patrocinadorId !== userId) {
      const destinatarios = [subproyecto.patrocinadorId, ...pmoIds];
      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        destinatarios,
        {
          titulo: `Asignación: Patrocinador de ${subproyecto.codigo}`,
          descripcion: `Has sido asignado como patrocinador del subproyecto "${subproyecto.nombre}"`,
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

    // 4. Validar fechas contra PGD (si tiene fechas)
    if (createDto.fechaInicio && createDto.fechaFin) {
      await this.validateFechasEnRangoPGD(
        createDto.proyectoPadreId,
        createDto.fechaInicio,
        createDto.fechaFin,
      );

      // Validar que fechaFin >= fechaInicio
      const inicio = this.parseDateString(createDto.fechaInicio);
      const fin = this.parseDateString(createDto.fechaFin);

      if (fin < inicio) {
        throw new BadRequestException('La fecha de fin debe ser posterior a la fecha de inicio');
      }
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
    const subproyecto = await this.findOne(id);

    // 1. Validar fechas si se actualizan
    if (updateDto.fechaInicio || updateDto.fechaFin) {
      const fechaInicio = updateDto.fechaInicio || subproyecto.fechaInicio?.toISOString().split('T')[0];
      const fechaFin = updateDto.fechaFin || subproyecto.fechaFin?.toISOString().split('T')[0];

      if (fechaInicio && fechaFin) {
        await this.validateFechasEnRangoPGD(subproyecto.proyectoPadreId, fechaInicio, fechaFin);

        const inicio = this.parseDateString(fechaInicio);
        const fin = this.parseDateString(fechaFin);

        if (fin < inicio) {
          throw new BadRequestException(
            'La fecha de fin debe ser posterior a la fecha de inicio',
          );
        }
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
      patrocinador:
        updateDto.patrocinadorId !== undefined &&
        updateDto.patrocinadorId !== subproyecto.patrocinadorId,
    };

    // 4. Actualizar
    Object.assign(subproyecto, updateDto, { updatedBy: userId });
    const saved = await this.subproyectoRepository.save(subproyecto);

    // 5. Auto-transición de estado (si campos completos y estado es Pendiente)
    if (saved.estado === ProyectoEstado.PENDIENTE && this.camposRequeridosCompletos(saved)) {
      // TODO: Verificar si tiene sprints (requiere integración con módulo Agile)
      // Por ahora, asumimos que si no tiene sprints pasa a "En planificacion"
      const tieneSprints = false; // Placeholder
      const nuevoEstado = tieneSprints
        ? ProyectoEstado.EN_DESARROLLO
        : ProyectoEstado.EN_PLANIFICACION;

      saved.estado = nuevoEstado;
      await this.subproyectoRepository.save(saved);
      await this.notificarCambioEstado(saved, nuevoEstado, userId);
    }

    // 6. Notificar cambios en roles
    if (rolesChanged.coordinador || rolesChanged.scrumMaster || rolesChanged.patrocinador) {
      await this.notificarCambiosRoles(saved, rolesChanged, userId);
    }

    return this.findOne(id);
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

    // Validar transición de estado (reglas de negocio similares a Proyecto)
    // Por ahora, permitimos todas las transiciones (se pueden agregar validaciones específicas)

    // Actualizar estado
    subproyecto.estado = dto.nuevoEstado;
    subproyecto.updatedBy = userId;
    await this.subproyectoRepository.save(subproyecto);

    // Notificar cambio de estado
    await this.notificarCambioEstado(subproyecto, dto.nuevoEstado, userId);

    return this.findOne(id);
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
