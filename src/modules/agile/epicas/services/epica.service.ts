import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Epica } from '../entities/epica.entity';
import { CreateEpicaDto } from '../dto/create-epica.dto';
import { UpdateEpicaDto } from '../dto/update-epica.dto';
import { ReordenarEpicasDto } from '../dto/reordenar-epicas.dto';
import { EpicaPrioridad } from '../enums/epica.enum';
import { EpicaEstadisticasResponseDto } from '../dto/epica-response.dto';

@Injectable()
export class EpicaService {
  constructor(
    @InjectRepository(Epica)
    private readonly epicaRepository: Repository<Epica>,
  ) {}

  async create(createDto: CreateEpicaDto, userId?: number): Promise<Epica> {
    // Auto-generate codigo if not provided
    let codigo = createDto.codigo;
    if (!codigo) {
      const count = await this.epicaRepository.count({
        where: { proyectoId: createDto.proyectoId },
      });
      codigo = `EP-${String(count + 1).padStart(3, '0')}`;
    }

    const existing = await this.epicaRepository.findOne({
      where: { proyectoId: createDto.proyectoId, codigo },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una épica con el código ${codigo} en este proyecto`,
      );
    }

    const epica = this.epicaRepository.create({
      ...createDto,
      codigo,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.epicaRepository.save(epica);
  }

  async findAll(filters?: {
    proyectoId?: number;
    prioridad?: EpicaPrioridad;
    activo?: boolean;
  }): Promise<Epica[]> {
    const queryBuilder = this.epicaRepository
      .createQueryBuilder('epica')
      .orderBy('epica.prioridad', 'ASC')
      .addOrderBy('epica.createdAt', 'DESC');

    if (filters?.proyectoId) {
      queryBuilder.andWhere('epica.proyectoId = :proyectoId', {
        proyectoId: filters.proyectoId,
      });
    }

    if (filters?.prioridad) {
      queryBuilder.andWhere('epica.prioridad = :prioridad', {
        prioridad: filters.prioridad,
      });
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('epica.activo = :activo', { activo: filters.activo });
    }

    return queryBuilder.getMany();
  }

  async findByProyecto(proyectoId: number): Promise<Epica[]> {
    return this.epicaRepository.find({
      where: { proyectoId, activo: true },
      order: { orden: 'ASC', prioridad: 'ASC', createdAt: 'DESC' },
    });
  }

  async reordenarEpicas(
    proyectoId: number,
    reordenarDto: ReordenarEpicasDto,
    userId?: number,
  ): Promise<void> {
    // Verificar que todas las épicas pertenecen al proyecto
    const epicaIds = reordenarDto.epicas.map((e) => e.id);
    const epicas = await this.epicaRepository.find({
      where: { id: In(epicaIds), proyectoId, activo: true },
    });

    if (epicas.length !== epicaIds.length) {
      throw new NotFoundException(
        'Una o más épicas no pertenecen al proyecto o no existen',
      );
    }

    // Actualizar el orden de cada épica
    for (const item of reordenarDto.epicas) {
      await this.epicaRepository.update(
        { id: item.id, proyectoId },
        { orden: item.orden, updatedBy: userId },
      );
    }
  }

  async findOne(id: number): Promise<Epica> {
    const epica = await this.epicaRepository.findOne({
      where: { id },
      relations: ['proyecto'],
    });

    if (!epica) {
      throw new NotFoundException(`Épica con ID ${id} no encontrada`);
    }

    return epica;
  }

  async update(id: number, updateDto: UpdateEpicaDto, userId?: number): Promise<Epica> {
    const epica = await this.findOne(id);

    Object.assign(epica, updateDto, { updatedBy: userId });

    return this.epicaRepository.save(epica);
  }

  async remove(id: number, userId?: number): Promise<Epica> {
    const epica = await this.findOne(id);
    epica.activo = false;
    epica.updatedBy = userId;
    return this.epicaRepository.save(epica);
  }

  async getEstadisticas(id: number): Promise<EpicaEstadisticasResponseDto> {
    const epica = await this.findOne(id);

    // Query to get HU statistics for this epica
    const stats = await this.epicaRepository.manager
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
      .addSelect('COALESCE(SUM(hu.story_points), 0)', 'totalStoryPoints')
      .addSelect(
        "COALESCE(SUM(CASE WHEN hu.estado = 'Terminada' THEN hu.story_points ELSE 0 END), 0)",
        'storyPointsCompletados',
      )
      .from('agile.historias_usuario', 'hu')
      .where('hu.epica_id = :epicaId', { epicaId: id })
      .andWhere('hu.activo = true')
      .getRawOne();

    const totalHUs = parseInt(stats?.totalHUs || '0', 10);
    const husCompletadas = parseInt(stats?.husCompletadas || '0', 10);
    const husEnProgreso = parseInt(stats?.husEnProgreso || '0', 10);
    const husPendientes = parseInt(stats?.husPendientes || '0', 10);
    const totalStoryPoints = parseInt(stats?.totalStoryPoints || '0', 10);
    const storyPointsCompletados = parseInt(stats?.storyPointsCompletados || '0', 10);

    const porcentajeAvance =
      totalStoryPoints > 0
        ? Math.round((storyPointsCompletados / totalStoryPoints) * 100 * 100) / 100
        : 0;

    return {
      epicaId: id,
      totalHUs,
      husCompletadas,
      husEnProgreso,
      husPendientes,
      totalStoryPoints,
      storyPointsCompletados,
      porcentajeAvance,
    };
  }
}
