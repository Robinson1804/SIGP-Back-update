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
import { AccionEstrategica } from '../../../planning/acciones-estrategicas/entities/accion-estrategica.entity';
import { CronogramaService } from '../../cronogramas/services/cronograma.service';
import { Usuario } from '../../../auth/entities/usuario.entity';
import { Role } from '../../../../common/constants/roles.constant';
import { Subproyecto } from '../../subproyectos/entities/subproyecto.entity';

@Injectable()
export class ProyectoService {
  constructor(
    @InjectRepository(Proyecto)
    private readonly proyectoRepository: Repository<Proyecto>,
    @InjectRepository(AccionEstrategica)
    private readonly accionEstrategicaRepository: Repository<AccionEstrategica>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(Subproyecto)
    private readonly subproyectoRepository: Repository<Subproyecto>,
    @Inject(forwardRef(() => NotificacionService))
    private readonly notificacionService: NotificacionService,
    @Inject(forwardRef(() => CronogramaService))
    private readonly cronogramaService: CronogramaService,
  ) {}

  /**
   * Obtiene los IDs de todos los usuarios con rol PMO activos
   */
  private async getPmoUserIds(): Promise<number[]> {
    const pmoUsers = await this.usuarioRepository.find({
      where: { rol: Role.PMO, activo: true },
      select: ['id'],
    });
    return pmoUsers.map(u => u.id);
  }

  /**
   * Obtiene el ID del usuario ADMINISTRADOR (único en el sistema).
   * El ADMIN recibe notificaciones de todos los eventos aunque no esté asignado al proyecto.
   */
  private async getAdminUserId(): Promise<number | null> {
    const admin = await this.usuarioRepository.findOne({
      where: { rol: Role.ADMIN, activo: true },
      select: ['id'],
    });
    return admin?.id ?? null;
  }

  /**
   * Verifica si todos los campos requeridos del proyecto están completos
   * para considerar la transición automática de estado.
   */
  private camposRequeridosCompletos(proyecto: Proyecto): boolean {
    return Boolean(
      proyecto.nombre?.trim() &&
      proyecto.descripcion?.trim() &&
      proyecto.clasificacion &&
      proyecto.accionEstrategicaId &&
      proyecto.coordinadorId &&
      proyecto.scrumMasterId &&
      (proyecto.coordinacion || proyecto.areaResponsable) &&
      proyecto.areasFinancieras?.length > 0 &&
      proyecto.fechaInicio &&
      proyecto.fechaFin &&
      proyecto.anios?.length > 0,
    );
  }

  /**
   * Convierte una fecha string (YYYY-MM-DD) a Date evitando problemas de timezone.
   * Crea la fecha a las 12:00:00 hora local para evitar que la conversión UTC
   * desplace la fecha al día anterior.
   */
  private parseDateString(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  /**
   * Genera el código del proyecto en formato PROY N°X
   * La secuencia es GLOBAL porque el constraint UNIQUE en la BD es global
   */
  private async generateCodigo(): Promise<string> {
    const proyectos = await this.proyectoRepository.find({
      select: ['codigo'],
    });

    let maxNum = 0;
    for (const proyecto of proyectos) {
      const match = proyecto.codigo.match(/PROY\s*N°(\d+)/i) || proyecto.codigo.match(/PROY-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    return `PROY N°${maxNum + 1}`;
  }

  /**
   * Obtener el siguiente código disponible para proyectos
   * Nota: El parámetro accionEstrategicaId se mantiene por compatibilidad pero no afecta la generación
   */
  async getNextCodigo(accionEstrategicaId?: number): Promise<string> {
    return this.generateCodigo();
  }

  /**
   * Valida que las fechas del proyecto estén dentro del rango del PGD asociado
   */
  private async validateFechasEnRangoPGD(
    accionEstrategicaId: number | undefined,
    fechaInicio: string | Date | undefined,
    fechaFin: string | Date | undefined,
  ): Promise<void> {
    if (!accionEstrategicaId || (!fechaInicio && !fechaFin)) return;

    // Obtener la AccionEstrategica con toda la cadena de relaciones hasta PGD
    const accion = await this.accionEstrategicaRepository.findOne({
      where: { id: accionEstrategicaId },
      relations: ['oegd', 'oegd.ogd', 'oegd.ogd.pgd'],
    });

    if (!accion || !accion.oegd?.ogd?.pgd) return;

    const pgd = accion.oegd.ogd.pgd;
    const pgdFechaInicio = new Date(`${pgd.anioInicio}-01-01`);
    const pgdFechaFin = new Date(`${pgd.anioFin}-12-31`);

    if (fechaInicio) {
      const fechaInicioDate = new Date(fechaInicio);
      if (fechaInicioDate < pgdFechaInicio || fechaInicioDate > pgdFechaFin) {
        throw new BadRequestException(
          `La fecha de inicio debe estar dentro del rango del PGD (${pgd.anioInicio}-01-01 a ${pgd.anioFin}-12-31)`
        );
      }
    }

    if (fechaFin) {
      const fechaFinDate = new Date(fechaFin);
      if (fechaFinDate < pgdFechaInicio || fechaFinDate > pgdFechaFin) {
        throw new BadRequestException(
          `La fecha de fin debe estar dentro del rango del PGD (${pgd.anioInicio}-01-01 a ${pgd.anioFin}-12-31)`
        );
      }
    }
  }

  /**
   * Valida que los años seleccionados del proyecto estén dentro del rango del PGD
   */
  private async validateAniosEnRangoPGD(
    accionEstrategicaId: number | undefined,
    anios: number[] | undefined,
  ): Promise<void> {
    if (!accionEstrategicaId || !anios || anios.length === 0) return;

    // Obtener la AccionEstrategica con toda la cadena de relaciones hasta PGD
    const accion = await this.accionEstrategicaRepository.findOne({
      where: { id: accionEstrategicaId },
      relations: ['oegd', 'oegd.ogd', 'oegd.ogd.pgd'],
    });

    if (!accion || !accion.oegd?.ogd?.pgd) return;

    const pgd = accion.oegd.ogd.pgd;
    const pgdAnioInicio = pgd.anioInicio;
    const pgdAnioFin = pgd.anioFin;

    // Verificar que todos los años estén dentro del rango del PGD
    for (const anio of anios) {
      if (anio < pgdAnioInicio || anio > pgdAnioFin) {
        throw new BadRequestException(
          `El año ${anio} está fuera del rango del PGD (${pgdAnioInicio} - ${pgdAnioFin})`
        );
      }
    }
  }

  /**
   * Valida que las fechas del proyecto estén dentro del rango de años seleccionados
   */
  private validateFechasEnRangoAnios(
    anios: number[] | undefined,
    fechaInicio: string | Date | undefined,
    fechaFin: string | Date | undefined,
  ): void {
    if (!anios || anios.length === 0 || (!fechaInicio && !fechaFin)) return;

    const minAnio = Math.min(...anios);
    const maxAnio = Math.max(...anios);
    const rangoFechaInicio = new Date(`${minAnio}-01-01`);
    const rangoFechaFin = new Date(`${maxAnio}-12-31`);

    if (fechaInicio) {
      const fechaInicioDate = new Date(fechaInicio);
      if (fechaInicioDate < rangoFechaInicio || fechaInicioDate > rangoFechaFin) {
        throw new BadRequestException(
          `La fecha de inicio debe estar dentro del rango de años seleccionados (${minAnio}-01-01 a ${maxAnio}-12-31)`
        );
      }
    }

    if (fechaFin) {
      const fechaFinDate = new Date(fechaFin);
      if (fechaFinDate < rangoFechaInicio || fechaFinDate > rangoFechaFin) {
        throw new BadRequestException(
          `La fecha de fin debe estar dentro del rango de años seleccionados (${minAnio}-01-01 a ${maxAnio}-12-31)`
        );
      }
    }
  }

  async create(createDto: CreateProyectoDto, userId?: number): Promise<Proyecto> {
    // Validar que la Acción Estratégica exista si se proporciona
    if (createDto.accionEstrategicaId) {
      const accionExiste = await this.accionEstrategicaRepository.findOne({
        where: { id: createDto.accionEstrategicaId },
      });
      if (!accionExiste) {
        throw new NotFoundException(
          `Acción Estratégica con ID ${createDto.accionEstrategicaId} no encontrada`
        );
      }
    }

    // Generar código automáticamente (secuencia global)
    const codigo = await this.generateCodigo();

    if (createDto.fechaInicio && createDto.fechaFin) {
      if (new Date(createDto.fechaFin) < new Date(createDto.fechaInicio)) {
        throw new BadRequestException('La fecha de fin debe ser mayor o igual a la fecha de inicio');
      }
    }

    // Validar que los años seleccionados estén dentro del rango del PGD
    await this.validateAniosEnRangoPGD(
      createDto.accionEstrategicaId,
      createDto.anios,
    );

    // Validar que las fechas estén dentro del rango del PGD
    await this.validateFechasEnRangoPGD(
      createDto.accionEstrategicaId,
      createDto.fechaInicio ?? undefined,
      createDto.fechaFin ?? undefined,
    );

    // Validar que las fechas estén dentro del rango de años seleccionados
    this.validateFechasEnRangoAnios(
      createDto.anios,
      createDto.fechaInicio ?? undefined,
      createDto.fechaFin ?? undefined,
    );

    // Desestructurar para manejar fechas por separado
    const { fechaInicio, fechaFin, ...restDto } = createDto;

    const proyecto = this.proyectoRepository.create({
      ...restDto,
      codigo, // Usar el código autogenerado
      metodoGestion: 'Scrum',
      // Las fechas se guardan como strings gracias al DateOnlyTransformer
      fechaInicio: fechaInicio || null,
      fechaFin: fechaFin || null,
      createdBy: userId,
      updatedBy: userId,
    });

    // Verificar si todos los campos requeridos están completos
    // Si es así, establecer estado como "En planificación" automáticamente
    if (this.camposRequeridosCompletos(proyecto)) {
      proyecto.estado = ProyectoEstado.EN_PLANIFICACION;
    }

    const proyectoGuardado: Proyecto = await this.proyectoRepository.save(proyecto);

    // Obtener nombres de usuarios asignados para notificaciones
    const [coordinadorUser, scrumMasterUser, areaUsuariaUser] = await Promise.all([
      createDto.coordinadorId ? this.usuarioRepository.findOne({ where: { id: createDto.coordinadorId }, select: ['id', 'nombre', 'apellido'] }) : null,
      createDto.scrumMasterId ? this.usuarioRepository.findOne({ where: { id: createDto.scrumMasterId }, select: ['id', 'nombre', 'apellido'] }) : null,
      createDto.areaUsuariaId ? this.usuarioRepository.findOne({ where: { id: createDto.areaUsuariaId }, select: ['id', 'nombre', 'apellido'] }) : null,
    ]);
    const coordNombre = coordinadorUser ? `${coordinadorUser.nombre} ${coordinadorUser.apellido}`.trim() : 'Sin asignar';
    const smNombre = scrumMasterUser ? `${scrumMasterUser.nombre} ${scrumMasterUser.apellido}`.trim() : 'Sin asignar';
    const auNombre = areaUsuariaUser ? `${areaUsuariaUser.nombre} ${areaUsuariaUser.apellido}`.trim() : 'Sin asignar';

    // Crear cronograma automáticamente para el proyecto
    try {
      await this.cronogramaService.create({
        proyectoId: proyectoGuardado.id,
        nombre: `Cronograma - ${proyectoGuardado.nombre}`,
        descripcion: `Cronograma del proyecto ${proyectoGuardado.codigo}`,
        fechaInicio: fechaInicio ?? undefined,
        fechaFin: fechaFin ?? undefined,
      }, userId);
    } catch (error) {
      console.error('Error al crear cronograma automático:', error);
      // No lanzamos error - el proyecto se creó correctamente
    }

    // Notificar sobre auto-transición a "En planificación" si aplica
    if (proyectoGuardado.estado === ProyectoEstado.EN_PLANIFICACION) {
      const destinatariosEstado: number[] = [];
      if (createDto.coordinadorId && createDto.coordinadorId !== userId) {
        destinatariosEstado.push(createDto.coordinadorId);
      }
      if (createDto.scrumMasterId && createDto.scrumMasterId !== userId && createDto.scrumMasterId !== createDto.coordinadorId) {
        destinatariosEstado.push(createDto.scrumMasterId);
      }

      // Agregar ADMIN
      const adminIdEstado = await this.getAdminUserId();
      if (adminIdEstado && adminIdEstado !== userId && !destinatariosEstado.includes(adminIdEstado)) {
        destinatariosEstado.push(adminIdEstado);
      }

      if (destinatariosEstado.length > 0) {
        await this.notificacionService.notificarMultiples(
          TipoNotificacion.PROYECTOS,
          destinatariosEstado,
          {
            titulo: `Proyecto creado en estado "En planificación": ${proyectoGuardado.codigo}`,
            descripcion: `El proyecto "${proyectoGuardado.nombre}" se creó con todos los campos completos y está listo para planificar sprints`,
            entidadTipo: 'Proyecto',
            entidadId: proyectoGuardado.id,
            proyectoId: proyectoGuardado.id,
            urlAccion: `/poi/proyecto/detalles?id=${proyectoGuardado.id}`,
          },
        );
      }
    }

    // Notificar al coordinador, PMOs y ADMIN si se le asigna el proyecto
    if (createDto.coordinadorId && createDto.coordinadorId !== userId) {
      const destinatariosCoord: number[] = [createDto.coordinadorId];

      // Agregar PMOs para que vean la asignación
      const pmoIds = await this.getPmoUserIds();
      for (const pmoId of pmoIds) {
        if (pmoId !== userId && !destinatariosCoord.includes(pmoId)) {
          destinatariosCoord.push(pmoId);
        }
      }

      // Agregar ADMIN: recibe todas las notificaciones de proyectos según matriz de permisos
      const adminId = await this.getAdminUserId();
      if (adminId && !destinatariosCoord.includes(adminId)) {
        destinatariosCoord.push(adminId);
      }

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        destinatariosCoord,
        {
          titulo: `Nuevo proyecto asignado: ${proyectoGuardado.codigo}`,
          descripcion: `${coordNombre} ha sido asignado/a como Coordinador del proyecto "${proyectoGuardado.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: proyectoGuardado.id,
          proyectoId: proyectoGuardado.id,
          urlAccion: `/poi/proyecto/detalles?id=${proyectoGuardado.id}`,
        },
      );
    }

    // Notificar al Scrum Master, PMOs y ADMIN si se le asigna
    if (createDto.scrumMasterId && createDto.scrumMasterId !== userId && createDto.scrumMasterId !== createDto.coordinadorId) {
      const destinatariosSM: number[] = [createDto.scrumMasterId];

      // Agregar PMOs
      const pmoIds = await this.getPmoUserIds();
      for (const pmoId of pmoIds) {
        if (pmoId !== userId && !destinatariosSM.includes(pmoId)) {
          destinatariosSM.push(pmoId);
        }
      }

      // Agregar ADMIN
      const adminId = await this.getAdminUserId();
      if (adminId && !destinatariosSM.includes(adminId)) {
        destinatariosSM.push(adminId);
      }

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        destinatariosSM,
        {
          titulo: `Nuevo proyecto asignado: ${proyectoGuardado.codigo}`,
          descripcion: `${smNombre} ha sido asignado/a como Scrum Master del proyecto "${proyectoGuardado.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: proyectoGuardado.id,
          proyectoId: proyectoGuardado.id,
          urlAccion: `/poi/proyecto/detalles?id=${proyectoGuardado.id}`,
        },
      );
    }

    // Notificar al patrocinador del Área Usuaria
    if (
      createDto.areaUsuariaId &&
      createDto.areaUsuariaId !== userId &&
      createDto.areaUsuariaId !== createDto.coordinadorId &&
      createDto.areaUsuariaId !== createDto.scrumMasterId
    ) {
      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        [createDto.areaUsuariaId],
        {
          titulo: `Asignado como Área Usuaria: ${proyectoGuardado.codigo}`,
          descripcion: `${auNombre} ha sido asignado/a como Área Usuaria del proyecto "${proyectoGuardado.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: proyectoGuardado.id,
          proyectoId: proyectoGuardado.id,
          urlAccion: `/poi/proyecto/detalles?id=${proyectoGuardado.id}`,
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
    pgdId?: number;
    responsableUsuarioId?: number;
    areaUsuariaUserId?: number;
  }): Promise<Proyecto[]> {
    const queryBuilder = this.proyectoRepository
      .createQueryBuilder('proyecto')
      .leftJoinAndSelect('proyecto.coordinador', 'coordinador')
      .leftJoinAndSelect('proyecto.scrumMaster', 'scrumMaster')
      .leftJoinAndSelect('proyecto.accionEstrategica', 'ae')
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

    // Filtrar por PGD a través de la cadena: Proyecto -> AE -> OEGD -> OGD -> PGD
    if (filters?.pgdId) {
      queryBuilder
        .leftJoin('ae.oegd', 'oegd')
        .leftJoin('oegd.ogd', 'ogd')
        .andWhere('ogd.pgdId = :pgdId', { pgdId: filters.pgdId });
    }

    if (filters?.responsableUsuarioId) {
      queryBuilder.andWhere(`proyecto.id IN (
        SELECT a.proyecto_id FROM rrhh.asignaciones a
        INNER JOIN rrhh.personal p ON p.id = a.personal_id
        WHERE p.usuario_id = :responsableUsuarioId
        AND a.tipo_asignacion = 'Proyecto'
        AND a.activo = true
      )`, { responsableUsuarioId: filters.responsableUsuarioId });
    }

    if (filters?.areaUsuariaUserId) {
      queryBuilder.andWhere('proyecto.area_usuaria = :areaUsuariaUserId', {
        areaUsuariaUserId: filters.areaUsuariaUserId,
      });
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
        'areaUsuaria',
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
      relations: ['coordinador', 'scrumMaster', 'areaUsuaria'],
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
    const areaUsuariaAnterior = proyecto.areaUsuariaId;

    if (updateDto.fechaInicio && updateDto.fechaFin) {
      if (new Date(updateDto.fechaFin) < new Date(updateDto.fechaInicio)) {
        throw new BadRequestException('La fecha de fin debe ser mayor o igual a la fecha de inicio');
      }
    }

    // Nota: null significa "limpiar el campo", undefined significa "no enviado, usar existente"
    const aniosAValidar = updateDto.anios ?? proyecto.anios;
    const accionEstrategicaIdAValidar = updateDto.accionEstrategicaId ?? proyecto.accionEstrategicaId;

    // Determinar fechas efectivas: null = limpiar, undefined = usar existente
    const fechaInicioEfectiva = updateDto.fechaInicio === null
      ? undefined
      : (updateDto.fechaInicio !== undefined ? updateDto.fechaInicio : (proyecto.fechaInicio ?? undefined));
    const fechaFinEfectiva = updateDto.fechaFin === null
      ? undefined
      : (updateDto.fechaFin !== undefined ? updateDto.fechaFin : (proyecto.fechaFin ?? undefined));

    // Validar que los años seleccionados estén dentro del rango del PGD
    await this.validateAniosEnRangoPGD(
      accionEstrategicaIdAValidar,
      aniosAValidar,
    );

    // Validar que las fechas estén dentro del rango del PGD
    await this.validateFechasEnRangoPGD(
      accionEstrategicaIdAValidar,
      fechaInicioEfectiva,
      fechaFinEfectiva,
    );

    // Validar que las fechas estén dentro del rango de años seleccionados
    if (aniosAValidar && (fechaInicioEfectiva || fechaFinEfectiva)) {
      this.validateFechasEnRangoAnios(
        aniosAValidar,
        fechaInicioEfectiva,
        fechaFinEfectiva,
      );
    }

    // Desestructurar para manejar fechas por separado
    const { fechaInicio: updateFechaInicio, fechaFin: updateFechaFin, ...restUpdateDto } = updateDto;

    // Preparar datos para la actualización, convirtiendo fechas apropiadamente
    const updateData: Partial<Proyecto> = {
      ...restUpdateDto,
      updatedBy: userId,
    };

    // Manejar fechaInicio: null = limpiar, undefined = no cambiar, string = convertir a Date
    if (updateFechaInicio !== undefined) {
      updateData.fechaInicio = updateFechaInicio ? this.parseDateString(updateFechaInicio) : (null as any);
    }
    // Manejar fechaFin: null = limpiar, undefined = no cambiar, string = convertir a Date
    if (updateFechaFin !== undefined) {
      updateData.fechaFin = updateFechaFin ? this.parseDateString(updateFechaFin) : (null as any);
    }

    // Usar update() del repositorio para evitar problemas con relaciones
    // TypeORM prioriza las relaciones sobre los campos de ID cuando se usa save()
    // Por eso usamos update() que trabaja directamente con los campos
    await this.proyectoRepository.update(id, updateData);

    // Recargar el proyecto con las relaciones actualizadas
    const saved = await this.findOne(id);

    // Auto-transición de estado: Pendiente → En planificación / En desarrollo
    if (saved.estado === ProyectoEstado.PENDIENTE && this.camposRequeridosCompletos(saved)) {
      try {
        // Verificar si ya existen sprints para este proyecto
        const sprintCount = await this.proyectoRepository.manager
          .createQueryBuilder()
          .select('COUNT(*)', 'count')
          .from('agile.sprints', 's')
          .where('s.proyecto_id = :proyectoId', { proyectoId: id })
          .andWhere('s.activo = true')
          .getRawOne();

        const hasSprints = parseInt(sprintCount?.count || '0', 10) > 0;
        const nuevoEstado = hasSprints ? ProyectoEstado.EN_DESARROLLO : ProyectoEstado.EN_PLANIFICACION;

        await this.proyectoRepository.update(id, { estado: nuevoEstado });
        saved.estado = nuevoEstado;

        // Notificar al equipo sobre el cambio de estado automático
        const destinatarios: number[] = [];
        if (saved.coordinadorId && saved.coordinadorId !== userId) {
          destinatarios.push(saved.coordinadorId);
        }
        if (saved.scrumMasterId && saved.scrumMasterId !== userId && saved.scrumMasterId !== saved.coordinadorId) {
          destinatarios.push(saved.scrumMasterId);
        }

        // Agregar ADMIN
        const adminIdAutoTransicion = await this.getAdminUserId();
        if (adminIdAutoTransicion && adminIdAutoTransicion !== userId && !destinatarios.includes(adminIdAutoTransicion)) {
          destinatarios.push(adminIdAutoTransicion);
        }

        if (destinatarios.length > 0) {
          await this.notificacionService.notificarMultiples(
            TipoNotificacion.PROYECTOS,
            destinatarios,
            {
              titulo: `Estado de proyecto actualizado: ${saved.codigo}`,
              descripcion: `El proyecto "${saved.nombre}" ha cambiado automáticamente a estado ${nuevoEstado}`,
              entidadTipo: 'Proyecto',
              entidadId: saved.id,
              proyectoId: saved.id,
              urlAccion: `/poi/proyecto/detalles?id=${saved.id}`,
            },
          );
        }
      } catch (error) {
        // No fallar la actualización por error en auto-transición
        console.error('Error en auto-transición de estado del proyecto:', error);
      }
    }

    // Notificar al nuevo coordinador si cambió
    if (updateDto.coordinadorId && updateDto.coordinadorId !== coordinadorAnterior && updateDto.coordinadorId !== userId) {
      const nuevoCoord = await this.usuarioRepository.findOne({
        where: { id: updateDto.coordinadorId },
        select: ['id', 'nombre', 'apellido'],
      });
      const nombreNuevoCoord = nuevoCoord ? `${nuevoCoord.nombre} ${nuevoCoord.apellido}`.trim() : 'el nuevo Coordinador';

      const destinatariosCoord: number[] = [updateDto.coordinadorId];
      const doerRole = await this.getDoerRole(userId);
      const adminId = await this.getAdminUserId();
      const pmoIds = await this.getPmoUserIds();

      if (doerRole === 'ADMIN') {
        for (const pmoId of pmoIds) {
          if (!destinatariosCoord.includes(pmoId)) destinatariosCoord.push(pmoId);
        }
      } else if (doerRole === 'PMO') {
        if (adminId && !destinatariosCoord.includes(adminId)) destinatariosCoord.push(adminId);
      }

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        destinatariosCoord,
        {
          titulo: `Asignado como Coordinador: ${proyecto.codigo}`,
          descripcion: `${nombreNuevoCoord} ha sido asignado/a como Coordinador del proyecto "${proyecto.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: proyecto.id,
          proyectoId: proyecto.id,
          urlAccion: `/poi/proyecto/detalles?id=${proyecto.id}`,
        },
      );
    }

    // Notificar al coordinador anterior que fue reemplazado
    if (updateDto.coordinadorId && updateDto.coordinadorId !== coordinadorAnterior && coordinadorAnterior && coordinadorAnterior !== userId) {
      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        [coordinadorAnterior],
        {
          titulo: `Reasignación en proyecto: ${proyecto.codigo}`,
          descripcion: `Has sido reemplazado como Coordinador del proyecto "${proyecto.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: proyecto.id,
          proyectoId: proyecto.id,
          urlAccion: `/poi/proyecto/detalles?id=${proyecto.id}`,
        },
      );
    }

    // Notificar al nuevo Scrum Master si cambió
    if (updateDto.scrumMasterId && updateDto.scrumMasterId !== scrumMasterAnterior && updateDto.scrumMasterId !== userId) {
      const nuevoSmUpdate = await this.usuarioRepository.findOne({
        where: { id: updateDto.scrumMasterId },
        select: ['id', 'nombre', 'apellido'],
      });
      const nombreNuevoSmUpdate = nuevoSmUpdate ? `${nuevoSmUpdate.nombre} ${nuevoSmUpdate.apellido}`.trim() : 'el nuevo Scrum Master';

      const destinatariosSM: number[] = [updateDto.scrumMasterId];
      const doerRoleSM = await this.getDoerRole(userId);
      const adminIdSM = await this.getAdminUserId();
      const pmoIdsSM = await this.getPmoUserIds();

      if (doerRoleSM === 'ADMIN') {
        for (const pmoId of pmoIdsSM) {
          if (!destinatariosSM.includes(pmoId)) destinatariosSM.push(pmoId);
        }
      } else if (doerRoleSM === 'PMO') {
        if (adminIdSM && !destinatariosSM.includes(adminIdSM)) destinatariosSM.push(adminIdSM);
      }

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        destinatariosSM,
        {
          titulo: `Asignado como Scrum Master: ${proyecto.codigo}`,
          descripcion: `${nombreNuevoSmUpdate} ha sido asignado/a como Scrum Master del proyecto "${proyecto.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: proyecto.id,
          proyectoId: proyecto.id,
          urlAccion: `/poi/proyecto/detalles?id=${proyecto.id}`,
        },
      );
    }

    // Notificar al Scrum Master anterior que fue reasignado
    if (updateDto.scrumMasterId && updateDto.scrumMasterId !== scrumMasterAnterior && scrumMasterAnterior && scrumMasterAnterior !== userId) {
      const nuevoSm = await this.usuarioRepository.findOne({
        where: { id: updateDto.scrumMasterId },
        select: ['id', 'nombre', 'apellido'],
      });
      const nombreNuevoSm = nuevoSm ? `${nuevoSm.nombre} ${nuevoSm.apellido}`.trim() : 'el nuevo Scrum Master';

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        [scrumMasterAnterior],
        {
          titulo: `Reasignación de Scrum Master en proyecto: ${proyecto.codigo}`,
          descripcion: `En el proyecto ${proyecto.codigo} - ${proyecto.nombre} ha sido reasignado el Scrum Master ${nombreNuevoSm}. Ya no eres parte del proyecto`,
          entidadTipo: 'Proyecto',
          entidadId: proyecto.id,
          proyectoId: proyecto.id,
          urlAccion: `/poi/proyecto/detalles?id=${proyecto.id}`,
        },
      );
    }

    // Notificar al nuevo patrocinador del Área Usuaria
    if (
      updateDto.areaUsuariaId !== undefined &&
      updateDto.areaUsuariaId !== null &&
      updateDto.areaUsuariaId !== proyecto.areaUsuariaId &&
      updateDto.areaUsuariaId !== userId
    ) {
      const nuevoAuUpdate = await this.usuarioRepository.findOne({
        where: { id: updateDto.areaUsuariaId },
        select: ['id', 'nombre', 'apellido'],
      });
      const nombreNuevoAuUpdate = nuevoAuUpdate ? `${nuevoAuUpdate.nombre} ${nuevoAuUpdate.apellido}`.trim() : 'el nuevo Área Usuaria';

      const destinatariosAU: number[] = [updateDto.areaUsuariaId];
      const doerRoleAU = await this.getDoerRole(userId);
      const adminIdAU = await this.getAdminUserId();
      const pmoIdsAU = await this.getPmoUserIds();

      if (doerRoleAU === 'ADMIN') {
        for (const pmoId of pmoIdsAU) {
          if (!destinatariosAU.includes(pmoId)) destinatariosAU.push(pmoId);
        }
      } else if (doerRoleAU === 'PMO') {
        if (adminIdAU && !destinatariosAU.includes(adminIdAU)) destinatariosAU.push(adminIdAU);
      }

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        destinatariosAU,
        {
          titulo: `Asignado como Área Usuaria: ${proyecto.codigo}`,
          descripcion: `${nombreNuevoAuUpdate} ha sido asignado/a como Área Usuaria del proyecto "${proyecto.nombre}"`,
          entidadTipo: 'Proyecto',
          entidadId: proyecto.id,
          proyectoId: proyecto.id,
          urlAccion: `/poi/proyecto/detalles?id=${proyecto.id}`,
        },
      );
    }

    // Notificar al patrocinador/Área Usuaria anterior que fue reasignado
    if (
      updateDto.areaUsuariaId !== undefined &&
      updateDto.areaUsuariaId !== null &&
      updateDto.areaUsuariaId !== areaUsuariaAnterior &&
      areaUsuariaAnterior &&
      areaUsuariaAnterior !== userId
    ) {
      const nuevoPatrocinador = await this.usuarioRepository.findOne({
        where: { id: updateDto.areaUsuariaId },
        select: ['id', 'nombre', 'apellido'],
      });
      const nombreNuevoPatrocinador = nuevoPatrocinador
        ? `${nuevoPatrocinador.nombre} ${nuevoPatrocinador.apellido}`.trim()
        : 'el nuevo Área Usuaria';

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS,
        [areaUsuariaAnterior],
        {
          titulo: `Reasignación de Área Usuaria en proyecto: ${proyecto.codigo}`,
          descripcion: `En el proyecto ${proyecto.codigo} - ${proyecto.nombre} ha sido reasignado el Área Usuaria/Patrocinador ${nombreNuevoPatrocinador}. Ya no eres parte del proyecto`,
          entidadTipo: 'Proyecto',
          entidadId: proyecto.id,
          proyectoId: proyecto.id,
          urlAccion: `/poi/proyecto/detalles?id=${proyecto.id}`,
        },
      );
    }

    return saved;
  }

  async cambiarEstado(id: number, cambiarEstadoDto: CambiarEstadoProyectoDto, userId?: number): Promise<Proyecto> {
    const proyecto = await this.findOne(id);
    const estadoAnterior = proyecto.estado;

    // Validar que todos los subproyectos estén finalizados antes de finalizar el proyecto
    if (cambiarEstadoDto.estado === ProyectoEstado.FINALIZADO) {
      const subproyectos = await this.subproyectoRepository.find({
        where: { proyectoPadreId: id, activo: true },
        select: ['id', 'codigo', 'nombre', 'estado'],
      });

      const subproyectosNoFinalizados = subproyectos.filter(
        sp => sp.estado !== 'Finalizado',
      );

      if (subproyectosNoFinalizados.length > 0) {
        const listaSubproyectos = subproyectosNoFinalizados
          .map(sp => `${sp.codigo} - ${sp.nombre}`)
          .join(', ');

        throw new BadRequestException(
          `No se puede finalizar el proyecto. Los siguientes subproyectos aún no están finalizados: ${listaSubproyectos}`,
        );
      }
    }

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

    // Notificar al equipo sobre el cambio de estado (incluyendo PMO)
    const destinatarios: number[] = [];

    // Agregar coordinador y scrum master
    if (proyecto.coordinadorId && proyecto.coordinadorId !== userId) {
      destinatarios.push(proyecto.coordinadorId);
    }
    if (proyecto.scrumMasterId && proyecto.scrumMasterId !== userId && proyecto.scrumMasterId !== proyecto.coordinadorId) {
      destinatarios.push(proyecto.scrumMasterId);
    }

    // Agregar todos los PMOs (ellos ven TODOS los cambios de estado)
    const pmoIds = await this.getPmoUserIds();
    for (const pmoId of pmoIds) {
      if (pmoId !== userId && !destinatarios.includes(pmoId)) {
        destinatarios.push(pmoId);
      }
    }

    // Agregar ADMIN
    const adminId = await this.getAdminUserId();
    if (adminId && adminId !== userId && !destinatarios.includes(adminId)) {
      destinatarios.push(adminId);
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
          urlAccion: `/poi/proyecto/detalles?id=${proyecto.id}`,
        },
      );
    }

    return proyectoActualizado;
  }

  async remove(id: number, userId?: number): Promise<Proyecto> {
    const proyecto = await this.findOne(id);
    proyecto.activo = false;
    proyecto.updatedBy = userId;
    const result = await this.proyectoRepository.save(proyecto);

    // Notificaciones de eliminación: PMO elimina → ADMIN; ADMIN elimina → PMO
    try {
      const doerRole = await this.getDoerRole(userId);
      if (doerRole === 'PMO') {
        const adminId = await this.getAdminUserId();
        if (adminId) {
          const doer = userId ? await this.usuarioRepository.findOne({ where: { id: userId }, select: ['id', 'nombre', 'apellido'] }) : null;
          const doerNombre = doer ? `${doer.nombre} ${doer.apellido}`.trim() : 'Un PMO';
          await this.notificacionService.notificarMultiples(TipoNotificacion.PROYECTOS, [adminId], {
            titulo: `Proyecto eliminado: ${proyecto.codigo}`,
            descripcion: `${doerNombre} (PMO) eliminó el proyecto "${proyecto.nombre}"`,
            entidadTipo: 'Proyecto',
            entidadId: proyecto.id,
            proyectoId: proyecto.id,
          });
        }
      } else if (doerRole === 'ADMIN') {
        const pmoIds = await this.getPmoUserIds();
        if (pmoIds.length > 0) {
          await this.notificacionService.notificarMultiples(TipoNotificacion.PROYECTOS, pmoIds, {
            titulo: `Proyecto eliminado: ${proyecto.codigo}`,
            descripcion: `El Administrador eliminó el proyecto "${proyecto.nombre}"`,
            entidadTipo: 'Proyecto',
            entidadId: proyecto.id,
            proyectoId: proyecto.id,
          });
        }
      }
    } catch (error) {
      console.error('Error enviando notificación de eliminación de proyecto:', error);
    }

    return result;
  }

  private async getDoerRole(userId: number | undefined): Promise<'ADMIN' | 'PMO' | 'OTHER'> {
    if (!userId) return 'OTHER';
    const adminId = await this.getAdminUserId();
    if (adminId === userId) return 'ADMIN';
    const pmoIds = await this.getPmoUserIds();
    if (pmoIds.includes(userId)) return 'PMO';
    return 'OTHER';
  }

  async findByAccionEstrategica(accionEstrategicaId: number): Promise<Proyecto[]> {
    return this.proyectoRepository.find({
      where: { accionEstrategicaId, activo: true },
      order: { codigo: 'ASC' },
    });
  }
}
