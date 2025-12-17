import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Actividad } from '../entities/actividad.entity';
import { CreateActividadDto } from '../dto/create-actividad.dto';
import { UpdateActividadDto } from '../dto/update-actividad.dto';
import { ActividadEstado } from '../enums/actividad-estado.enum';

@Injectable()
export class ActividadService {
  constructor(
    @InjectRepository(Actividad)
    private readonly actividadRepository: Repository<Actividad>,
  ) {}

  async create(createDto: CreateActividadDto, userId?: number): Promise<Actividad> {
    const existing = await this.actividadRepository.findOne({
      where: { codigo: createDto.codigo },
    });

    if (existing) {
      throw new ConflictException(`Ya existe una actividad con el código ${createDto.codigo}`);
    }

    const actividad = this.actividadRepository.create({
      ...createDto,
      metodoGestion: 'Kanban',
      createdBy: userId,
      updatedBy: userId,
    });

    return this.actividadRepository.save(actividad);
  }

  async findAll(filters?: {
    estado?: ActividadEstado;
    coordinadorId?: number;
    accionEstrategicaId?: number;
    activo?: boolean;
  }): Promise<Actividad[]> {
    const queryBuilder = this.actividadRepository
      .createQueryBuilder('actividad')
      .leftJoinAndSelect('actividad.coordinador', 'coordinador')
      .orderBy('actividad.createdAt', 'DESC');

    if (filters?.estado) {
      queryBuilder.andWhere('actividad.estado = :estado', { estado: filters.estado });
    }

    if (filters?.coordinadorId) {
      queryBuilder.andWhere('actividad.coordinadorId = :coordinadorId', { coordinadorId: filters.coordinadorId });
    }

    if (filters?.accionEstrategicaId) {
      queryBuilder.andWhere('actividad.accionEstrategicaId = :accionEstrategicaId', { accionEstrategicaId: filters.accionEstrategicaId });
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('actividad.activo = :activo', { activo: filters.activo });
    }

    return queryBuilder.getMany();
  }

  async findOne(id: number): Promise<Actividad> {
    const actividad = await this.actividadRepository.findOne({
      where: { id },
      relations: ['coordinador', 'accionEstrategica'],
    });

    if (!actividad) {
      throw new NotFoundException(`Actividad con ID ${id} no encontrada`);
    }

    return actividad;
  }

  async update(id: number, updateDto: UpdateActividadDto, userId?: number): Promise<Actividad> {
    const actividad = await this.findOne(id);
    Object.assign(actividad, updateDto, { updatedBy: userId });
    return this.actividadRepository.save(actividad);
  }

  async remove(id: number, userId?: number): Promise<Actividad> {
    const actividad = await this.findOne(id);
    actividad.activo = false;
    actividad.updatedBy = userId;
    return this.actividadRepository.save(actividad);
  }

  async findByAccionEstrategica(accionEstrategicaId: number): Promise<Actividad[]> {
    return this.actividadRepository.find({
      where: { accionEstrategicaId, activo: true },
      order: { codigo: 'ASC' },
    });
  }
}
