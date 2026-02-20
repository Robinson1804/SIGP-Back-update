import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asignacion } from '../entities/asignacion.entity';
import { Personal } from '../../personal/entities/personal.entity';
import { CreateAsignacionDto } from '../dto/create-asignacion.dto';
import { UpdateAsignacionDto } from '../dto/update-asignacion.dto';
import { AlertaSobrecargaResponseDto } from '../dto/asignacion-response.dto';
import { TipoAsignacion } from '../enums/tipo-asignacion.enum';

@Injectable()
export class AsignacionService {
  private readonly logger = new Logger(AsignacionService.name);

  constructor(
    @InjectRepository(Asignacion)
    private readonly asignacionRepository: Repository<Asignacion>,
    @InjectRepository(Personal)
    private readonly personalRepository: Repository<Personal>,
  ) {}

  async create(createDto: CreateAsignacionDto, userId?: number): Promise<Asignacion> {
    // Validate reference based on type
    this.validarReferencia(createDto);

    // Check if exceeds 100% dedication (only for execution roles)
    // This will skip verification for Coordinador, Scrum Master, Patrocinador, Product Owner
    await this.verificarSobrecarga(
      createDto.personalId,
      createDto.porcentajeDedicacion,
      undefined, // excludeAsignacionId (no aplica en create)
      createDto.rolEquipo, // Pass role to check if it's a management role
    );

    const asignacion = this.asignacionRepository.create({
      ...createDto,
      createdBy: userId,
      updatedBy: userId,
    });

    const saved = await this.asignacionRepository.save(asignacion);

    // Update personal availability
    await this.actualizarDisponibilidad(createDto.personalId);

    return this.findOne(saved.id);
  }

  private validarReferencia(dto: CreateAsignacionDto): void {
    switch (dto.tipoAsignacion) {
      case TipoAsignacion.PROYECTO:
        if (!dto.proyectoId) {
          throw new BadRequestException('proyectoId es requerido para asignaciones de tipo Proyecto');
        }
        break;
      case TipoAsignacion.ACTIVIDAD:
        if (!dto.actividadId) {
          throw new BadRequestException('actividadId es requerido para asignaciones de tipo Actividad');
        }
        break;
      case TipoAsignacion.SUBPROYECTO:
        if (!dto.subproyectoId) {
          throw new BadRequestException('subproyectoId es requerido para asignaciones de tipo Subproyecto');
        }
        break;
    }
  }

  private async calcularDedicacionActual(
    personalId: number,
    excludeAsignacionId?: number,
  ): Promise<number> {
    const queryBuilder = this.asignacionRepository
      .createQueryBuilder('a')
      .select('COALESCE(SUM(a.porcentaje_dedicacion), 0)', 'total')
      .where('a.personal_id = :personalId', { personalId })
      .andWhere('a.activo = true')
      .andWhere('(a.fecha_fin IS NULL OR a.fecha_fin >= CURRENT_DATE)');

    if (excludeAsignacionId) {
      queryBuilder.andWhere('a.id != :excludeId', { excludeId: excludeAsignacionId });
    }

    const result = await queryBuilder.getRawOne();
    return Number(result.total);
  }

  private async actualizarDisponibilidad(personalId: number): Promise<void> {
    const dedicacion = await this.calcularDedicacionActual(personalId);
    await this.personalRepository.update(personalId, {
      disponible: dedicacion < 100,
    });
  }

  async findAll(filters?: {
    personalId?: number;
    tipoAsignacion?: TipoAsignacion;
    proyectoId?: number;
    actividadId?: number;
    subproyectoId?: number;
    activo?: boolean;
  }): Promise<Asignacion[]> {
    const queryBuilder = this.asignacionRepository
      .createQueryBuilder('asignacion')
      .leftJoinAndSelect('asignacion.personal', 'personal')
      .leftJoinAndSelect('asignacion.proyecto', 'proyecto')
      .leftJoinAndSelect('asignacion.actividad', 'actividad')
      .leftJoinAndSelect('asignacion.subproyecto', 'subproyecto')
      .orderBy('asignacion.fechaInicio', 'DESC');

    if (filters?.personalId) {
      queryBuilder.andWhere('asignacion.personalId = :personalId', {
        personalId: filters.personalId,
      });
    }

    if (filters?.tipoAsignacion) {
      queryBuilder.andWhere('asignacion.tipoAsignacion = :tipoAsignacion', {
        tipoAsignacion: filters.tipoAsignacion,
      });
    }

    if (filters?.proyectoId) {
      queryBuilder.andWhere('asignacion.proyectoId = :proyectoId', {
        proyectoId: filters.proyectoId,
      });
    }

    if (filters?.actividadId) {
      queryBuilder.andWhere('asignacion.actividadId = :actividadId', {
        actividadId: filters.actividadId,
      });
    }

    if (filters?.subproyectoId) {
      queryBuilder.andWhere('asignacion.subproyectoId = :subproyectoId', {
        subproyectoId: filters.subproyectoId,
      });
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('asignacion.activo = :activo', {
        activo: filters.activo,
      });
    }

    return queryBuilder.getMany();
  }

  async findOne(id: number): Promise<Asignacion> {
    const asignacion = await this.asignacionRepository.findOne({
      where: { id },
      relations: ['personal', 'proyecto', 'actividad', 'subproyecto'],
    });

    if (!asignacion) {
      throw new NotFoundException(`Asignación con ID ${id} no encontrada`);
    }

    return asignacion;
  }

  async findByProyecto(proyectoId: number): Promise<Asignacion[]> {
    return this.asignacionRepository.find({
      where: { proyectoId, activo: true },
      relations: ['personal', 'personal.usuario'],
      order: { porcentajeDedicacion: 'DESC' },
    });
  }

  async findByActividad(actividadId: number): Promise<Asignacion[]> {
    return this.asignacionRepository.find({
      where: { actividadId, activo: true },
      relations: ['personal', 'personal.usuario'],
      order: { porcentajeDedicacion: 'DESC' },
    });
  }

  async findBySubproyecto(subproyectoId: number): Promise<Asignacion[]> {
    return this.asignacionRepository.find({
      where: { subproyectoId, activo: true },
      relations: ['personal'],
      order: { porcentajeDedicacion: 'DESC' },
    });
  }

  async update(id: number, updateDto: UpdateAsignacionDto, userId?: number): Promise<Asignacion> {
    const asignacion = await this.findOne(id);

    // Validate new dedication if changing
    if (updateDto.porcentajeDedicacion !== undefined) {
      const dedicacionActual = await this.calcularDedicacionActual(
        asignacion.personalId,
        id,
      );
      const nuevaDedicacion = dedicacionActual + Number(updateDto.porcentajeDedicacion);

      if (nuevaDedicacion > 100) {
        throw new ConflictException(
          `El personal tiene ${dedicacionActual}% en otras asignaciones. ` +
          `No se puede asignar ${updateDto.porcentajeDedicacion}% (excedería 100%)`,
        );
      }
    }

    Object.assign(asignacion, updateDto, { updatedBy: userId });

    const saved = await this.asignacionRepository.save(asignacion);

    // Update personal availability
    await this.actualizarDisponibilidad(asignacion.personalId);

    return saved;
  }

  async remove(id: number, userId?: number): Promise<Asignacion> {
    const asignacion = await this.findOne(id);
    asignacion.activo = false;
    asignacion.updatedBy = userId;

    const saved = await this.asignacionRepository.save(asignacion);

    // Update personal availability
    await this.actualizarDisponibilidad(asignacion.personalId);

    return saved;
  }

  /**
   * Verifica si asignar un porcentaje a un personal causaría sobrecarga (>100%)
   * IMPORTANTE: Solo aplica para roles de ejecución (Desarrollador, Implementador)
   * NO aplica para roles de gestión (Coordinador, Scrum Master, Patrocinador)
   *
   * @param personalId - ID del personal a verificar
   * @param porcentajeNuevo - Porcentaje que se desea asignar
   * @param excludeAsignacionId - ID de asignación a excluir (para actualizaciones)
   * @param rolEquipo - Rol en el equipo ('Desarrollador', 'Implementador', etc.)
   * @throws BadRequestException si causaría sobrecarga para roles de ejecución
   */
  async verificarSobrecarga(
    personalId: number,
    porcentajeNuevo: number,
    excludeAsignacionId?: number,
    rolEquipo?: string,
  ): Promise<void> {
    // Defensive: validate inputs
    if (!personalId || porcentajeNuevo === null || porcentajeNuevo === undefined) {
      this.logger.warn(
        `[verificarSobrecarga] Parámetros inválidos: personalId=${personalId}, porcentaje=${porcentajeNuevo}`,
      );
      return; // Don't block if invalid params
    }

    // CRITICAL: Solo verificar sobrecarga para roles de ejecución
    // Coordinadores, Scrum Masters y Patrocinadores NO tienen límite de dedicación
    const rolesDeGestion = ['Coordinador', 'Scrum Master', 'Patrocinador', 'Product Owner'];
    if (rolEquipo && rolesDeGestion.includes(rolEquipo)) {
      this.logger.log(
        `[verificarSobrecarga] Rol de gestión "${rolEquipo}" - sobrecarga no aplica`,
      );
      return; // Don't verify for management roles
    }

    try {
      // Get current assignments with null safety
      // Solo contar asignaciones de ejecución (con roles Desarrollador/Implementador)
      const asignaciones = await this.asignacionRepository.find({
        where: {
          personalId,
          activo: true,
        },
      });

      // Defensive: handle undefined or null array
      if (!asignaciones || !Array.isArray(asignaciones)) {
        this.logger.warn(
          `[verificarSobrecarga] No se encontraron asignaciones para personal ${personalId}`,
        );
        return; // Don't block if no assignments found
      }

      // Filter active assignments and exclude:
      // 1. The assignment being updated (if excludeAsignacionId provided)
      // 2. Assignments with management roles (shouldn't count towards dedication)
      // 3. Assignments that have ended
      const asignacionesActivas = asignaciones.filter((a) => {
        // Exclude the assignment being updated
        if (excludeAsignacionId && a.id === excludeAsignacionId) {
          return false;
        }
        // Exclude management roles from dedication calculation
        if (a.rolEquipo && rolesDeGestion.includes(a.rolEquipo)) {
          return false;
        }
        // Only count active assignments that haven't ended
        return !a.fechaFin || new Date(a.fechaFin) >= new Date();
      });

      // Calculate current dedication (only from execution roles)
      const dedicacionActual = asignacionesActivas.reduce((sum, a) => {
        return sum + Number(a.porcentajeDedicacion || 0);
      }, 0);

      const nuevaDedicacion = dedicacionActual + Number(porcentajeNuevo);

      if (nuevaDedicacion > 100) {
        throw new BadRequestException(
          `El personal tiene ${dedicacionActual}% asignado en roles de ejecución. ` +
            `No se puede agregar ${porcentajeNuevo}% (excedería 100%). ` +
            `Total resultante: ${nuevaDedicacion}%`,
        );
      }

      this.logger.log(
        `[verificarSobrecarga] Verificación OK - Personal ${personalId}: ${dedicacionActual}% actual + ${porcentajeNuevo}% nuevo = ${nuevaDedicacion}%`,
      );
    } catch (error) {
      // If it's our BadRequestException, re-throw it
      if (error instanceof BadRequestException) {
        throw error;
      }
      // For any other error, log and don't block the operation
      this.logger.error(`[verificarSobrecarga] Error inesperado:`, error);
      // Don't block the operation on unexpected errors
      return;
    }
  }

  /**
   * Wrapper para verificar sobrecarga antes de guardar
   * Used by subproyecto and other services
   * @param personalId - ID del personal
   * @param porcentaje - Porcentaje de dedicación
   * @param excludeAsignacionId - ID de asignación a excluir (opcional)
   * @param rolEquipo - Rol en el equipo (opcional, para filtrar roles de gestión)
   */
  async verificarSobrecargaAntesDeGuardar(
    personalId: number,
    porcentaje: number,
    excludeAsignacionId?: number,
    rolEquipo?: string,
  ): Promise<void> {
    return this.verificarSobrecarga(personalId, porcentaje, excludeAsignacionId, rolEquipo);
  }

  async getAlertasSobrecarga(): Promise<AlertaSobrecargaResponseDto[]> {
    // Get all personal with active assignments exceeding 100%
    const resultados = await this.asignacionRepository
      .createQueryBuilder('a')
      .select('a.personal_id', 'personalId')
      .addSelect('p.nombres', 'nombres')
      .addSelect('p.apellidos', 'apellidos')
      .addSelect('p.codigo_empleado', 'codigoEmpleado')
      .addSelect('p.horas_semanales', 'horasSemanales')
      .addSelect('SUM(a.porcentaje_dedicacion)', 'porcentajeTotal')
      .innerJoin('a.personal', 'p')
      .where('a.activo = true')
      .andWhere('(a.fecha_fin IS NULL OR a.fecha_fin >= CURRENT_DATE)')
      .groupBy('a.personal_id')
      .addGroupBy('p.nombres')
      .addGroupBy('p.apellidos')
      .addGroupBy('p.codigo_empleado')
      .addGroupBy('p.horas_semanales')
      .having('SUM(a.porcentaje_dedicacion) > 100')
      .getRawMany();

    // Get details for each overloaded personal
    const alertas: AlertaSobrecargaResponseDto[] = [];

    for (const r of resultados) {
      const asignaciones = await this.asignacionRepository.find({
        where: { personalId: r.personalId, activo: true },
        relations: ['proyecto', 'actividad'],
      });

      alertas.push({
        personalId: r.personalId,
        nombres: r.nombres,
        apellidos: r.apellidos,
        codigoEmpleado: r.codigoEmpleado,
        porcentajeTotal: Number(r.porcentajeTotal),
        horasSemanales: Number(r.horasSemanales),
        exceso: Number(r.porcentajeTotal) - 100,
        asignaciones: asignaciones
          .filter((a) => !a.fechaFin || new Date(a.fechaFin) >= new Date())
          .map((a) => ({
            tipo: a.tipoAsignacion,
            nombre: a.proyecto?.nombre || a.actividad?.nombre || 'N/A',
            porcentaje: Number(a.porcentajeDedicacion),
          })),
      });
    }

    return alertas;
  }
}
