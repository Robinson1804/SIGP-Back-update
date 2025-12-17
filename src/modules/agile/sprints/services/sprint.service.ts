import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sprint } from '../entities/sprint.entity';
import { CreateSprintDto } from '../dto/create-sprint.dto';
import { UpdateSprintDto } from '../dto/update-sprint.dto';
import { CerrarSprintDto } from '../dto/cerrar-sprint.dto';
import { SprintEstado } from '../enums/sprint.enum';
import {
  BurndownResponseDto,
  SprintMetricasResponseDto,
} from '../dto/sprint-response.dto';
import { HistorialCambioService } from '../../common/services/historial-cambio.service';
import { HistorialEntidadTipo, HistorialAccion } from '../../common/enums/historial-cambio.enum';

@Injectable()
export class SprintService {
  constructor(
    @InjectRepository(Sprint)
    private readonly sprintRepository: Repository<Sprint>,
    private readonly historialCambioService: HistorialCambioService,
  ) {}

  async create(createDto: CreateSprintDto, userId?: number): Promise<Sprint> {
    const sprint = this.sprintRepository.create({
      ...createDto,
      createdBy: userId,
      updatedBy: userId,
    });

    const sprintGuardado = await this.sprintRepository.save(sprint);

    // Registrar creacion en historial
    if (userId) {
      await this.historialCambioService.registrarCreacion(
        HistorialEntidadTipo.SPRINT,
        sprintGuardado.id,
        userId,
        { nombre: sprintGuardado.nombre },
      );
    }

    return sprintGuardado;
  }

  async findAll(filters?: {
    proyectoId?: number;
    estado?: SprintEstado;
    activo?: boolean;
  }): Promise<Sprint[]> {
    const queryBuilder = this.sprintRepository
      .createQueryBuilder('sprint')
      .orderBy('sprint.fechaInicio', 'DESC');

    if (filters?.proyectoId) {
      queryBuilder.andWhere('sprint.proyectoId = :proyectoId', {
        proyectoId: filters.proyectoId,
      });
    }

    if (filters?.estado) {
      queryBuilder.andWhere('sprint.estado = :estado', { estado: filters.estado });
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('sprint.activo = :activo', { activo: filters.activo });
    }

    return queryBuilder.getMany();
  }

  async findByProyecto(proyectoId: number): Promise<Sprint[]> {
    return this.sprintRepository.find({
      where: { proyectoId, activo: true },
      order: { fechaInicio: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Sprint> {
    const sprint = await this.sprintRepository.findOne({
      where: { id },
      relations: ['proyecto'],
    });

    if (!sprint) {
      throw new NotFoundException(`Sprint con ID ${id} no encontrado`);
    }

    return sprint;
  }

  async update(id: number, updateDto: UpdateSprintDto, userId?: number): Promise<Sprint> {
    const sprint = await this.findOne(id);

    if (sprint.estado === SprintEstado.COMPLETADO) {
      throw new BadRequestException('No se puede modificar un sprint completado');
    }

    // Clonar valores anteriores para comparacion
    const valoresAnteriores = {
      nombre: sprint.nombre,
      sprintGoal: sprint.sprintGoal,
      fechaInicio: sprint.fechaInicio,
      fechaFin: sprint.fechaFin,
    };

    Object.assign(sprint, updateDto, { updatedBy: userId });

    const sprintActualizado = await this.sprintRepository.save(sprint);

    // Registrar cambios en historial
    if (userId) {
      await this.historialCambioService.registrarCambiosMultiples(
        HistorialEntidadTipo.SPRINT,
        id,
        valoresAnteriores,
        updateDto,
        userId,
      );
    }

    return sprintActualizado;
  }

  async iniciar(id: number, userId?: number): Promise<Sprint> {
    const sprint = await this.findOne(id);
    const estadoAnterior = sprint.estado;

    if (sprint.estado !== SprintEstado.PLANIFICADO) {
      throw new BadRequestException('Solo se puede iniciar un sprint en estado Planificado');
    }

    // Check if there's already an active sprint for this project
    const activeSprint = await this.sprintRepository.findOne({
      where: {
        proyectoId: sprint.proyectoId,
        estado: SprintEstado.ACTIVO,
        activo: true,
      },
    });

    if (activeSprint) {
      throw new ConflictException(
        `Ya existe un sprint activo (${activeSprint.nombre}) para este proyecto`,
      );
    }

    sprint.estado = SprintEstado.ACTIVO;
    sprint.fechaInicioReal = new Date();
    sprint.updatedBy = userId;

    const sprintIniciado = await this.sprintRepository.save(sprint);

    // Registrar inicio en historial
    if (userId) {
      await this.historialCambioService.registrarCambio({
        entidadTipo: HistorialEntidadTipo.SPRINT,
        entidadId: id,
        accion: HistorialAccion.INICIO,
        campoModificado: 'estado',
        valorAnterior: estadoAnterior,
        valorNuevo: SprintEstado.ACTIVO,
        usuarioId: userId,
      });
    }

    return sprintIniciado;
  }

  async cerrar(id: number, cerrarDto: CerrarSprintDto, userId?: number): Promise<Sprint> {
    const sprint = await this.findOne(id);
    const estadoAnterior = sprint.estado;

    if (sprint.estado !== SprintEstado.ACTIVO) {
      throw new BadRequestException('Solo se puede cerrar un sprint activo');
    }

    sprint.estado = SprintEstado.COMPLETADO;
    sprint.fechaFinReal = new Date();
    sprint.updatedBy = userId;

    if (cerrarDto.linkEvidencia) {
      sprint.linkEvidencia = cerrarDto.linkEvidencia;
    }

    const sprintCerrado = await this.sprintRepository.save(sprint);

    // Registrar cierre en historial
    if (userId) {
      await this.historialCambioService.registrarCambio({
        entidadTipo: HistorialEntidadTipo.SPRINT,
        entidadId: id,
        accion: HistorialAccion.CIERRE,
        campoModificado: 'estado',
        valorAnterior: estadoAnterior,
        valorNuevo: SprintEstado.COMPLETADO,
        usuarioId: userId,
      });
    }

    return sprintCerrado;
  }

  async remove(id: number, userId?: number): Promise<Sprint> {
    const sprint = await this.findOne(id);

    if (sprint.estado === SprintEstado.ACTIVO) {
      throw new BadRequestException('No se puede eliminar un sprint activo');
    }

    sprint.activo = false;
    sprint.updatedBy = userId;

    const sprintEliminado = await this.sprintRepository.save(sprint);

    // Registrar eliminacion en historial
    if (userId) {
      await this.historialCambioService.registrarEliminacion(
        HistorialEntidadTipo.SPRINT,
        id,
        userId,
      );
    }

    return sprintEliminado;
  }

  async getBurndown(id: number): Promise<BurndownResponseDto> {
    const sprint = await this.findOne(id);

    // Get total story points for HUs in this sprint
    const spResult = await this.sprintRepository.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(hu.story_points), 0)', 'totalSP')
      .from('agile.historias_usuario', 'hu')
      .where('hu.sprint_id = :sprintId', { sprintId: id })
      .andWhere('hu.activo = true')
      .getRawOne();

    const totalStoryPoints = parseInt(spResult?.totalSP || '0', 10);

    // Calculate days
    const fechaInicio = new Date(sprint.fechaInicio);
    const fechaFin = new Date(sprint.fechaFin);
    const diasTotales = Math.ceil(
      (fechaFin.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24),
    );

    const dias: { fecha: string; spRestantes: number; spIdeal: number }[] = [];
    const spPorDia = totalStoryPoints / diasTotales;

    for (let i = 0; i <= diasTotales; i++) {
      const fecha = new Date(fechaInicio);
      fecha.setDate(fecha.getDate() + i);

      // For now, calculate ideal line; real data would come from daily snapshots
      const spIdeal = Math.max(0, totalStoryPoints - spPorDia * i);

      dias.push({
        fecha: fecha.toISOString().split('T')[0],
        spRestantes: totalStoryPoints, // Would be calculated from actual data
        spIdeal: Math.round(spIdeal * 100) / 100,
      });
    }

    return {
      sprintId: id,
      totalStoryPoints,
      dias,
    };
  }

  async getMetricas(id: number): Promise<SprintMetricasResponseDto> {
    const sprint = await this.findOne(id);

    // Calculate days
    const fechaInicio = new Date(sprint.fechaInicio);
    const fechaFin = new Date(sprint.fechaFin);
    const hoy = new Date();

    const diasTotales = Math.ceil(
      (fechaFin.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24),
    );
    const diasTranscurridos = Math.max(
      0,
      Math.ceil((hoy.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const diasRestantes = Math.max(0, diasTotales - diasTranscurridos);

    // Get HU statistics
    const stats = await this.sprintRepository.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'totalHUs')
      .addSelect("SUM(CASE WHEN hu.estado = 'Terminada' THEN 1 ELSE 0 END)", 'husCompletadas')
      .addSelect(
        "SUM(CASE WHEN hu.estado IN ('En desarrollo', 'En pruebas', 'En revision') THEN 1 ELSE 0 END)",
        'husEnProgreso',
      )
      .addSelect(
        "SUM(CASE WHEN hu.estado IN ('Pendiente', 'En analisis', 'Lista') THEN 1 ELSE 0 END)",
        'husPendientes',
      )
      .addSelect('COALESCE(SUM(hu.story_points), 0)', 'totalSP')
      .addSelect(
        "COALESCE(SUM(CASE WHEN hu.estado = 'Terminada' THEN hu.story_points ELSE 0 END), 0)",
        'spCompletados',
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN hu.estado IN ('En desarrollo', 'En pruebas', 'En revision') THEN hu.story_points ELSE 0 END), 0)",
        'spEnProgreso',
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN hu.estado IN ('Pendiente', 'En analisis', 'Lista') THEN hu.story_points ELSE 0 END), 0)",
        'spPendientes',
      )
      .from('agile.historias_usuario', 'hu')
      .where('hu.sprint_id = :sprintId', { sprintId: id })
      .andWhere('hu.activo = true')
      .getRawOne();

    const totalHUs = parseInt(stats?.totalHUs || '0', 10);
    const husCompletadas = parseInt(stats?.husCompletadas || '0', 10);
    const husEnProgreso = parseInt(stats?.husEnProgreso || '0', 10);
    const husPendientes = parseInt(stats?.husPendientes || '0', 10);
    const totalStoryPoints = parseInt(stats?.totalSP || '0', 10);
    const storyPointsCompletados = parseInt(stats?.spCompletados || '0', 10);
    const storyPointsEnProgreso = parseInt(stats?.spEnProgreso || '0', 10);
    const storyPointsPendientes = parseInt(stats?.spPendientes || '0', 10);

    const velocidad = storyPointsCompletados;
    const porcentajeAvanceHUs = totalHUs > 0 ? (husCompletadas / totalHUs) * 100 : 0;
    const porcentajeAvanceSP =
      totalStoryPoints > 0 ? (storyPointsCompletados / totalStoryPoints) * 100 : 0;

    return {
      sprintId: id,
      nombre: sprint.nombre,
      diasTotales,
      diasTranscurridos,
      diasRestantes,
      totalHUs,
      husCompletadas,
      husEnProgreso,
      husPendientes,
      totalStoryPoints,
      storyPointsCompletados,
      storyPointsEnProgreso,
      storyPointsPendientes,
      velocidad,
      porcentajeAvanceHUs: Math.round(porcentajeAvanceHUs * 100) / 100,
      porcentajeAvanceSP: Math.round(porcentajeAvanceSP * 100) / 100,
    };
  }
}
