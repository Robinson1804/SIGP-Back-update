import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cronograma } from '../entities/cronograma.entity';
import { CreateCronogramaDto } from '../dto/create-cronograma.dto';
import { UpdateCronogramaDto } from '../dto/update-cronograma.dto';
import { CronogramaEstado } from '../enums/cronograma.enum';

@Injectable()
export class CronogramaService {
  constructor(
    @InjectRepository(Cronograma)
    private readonly cronogramaRepository: Repository<Cronograma>,
  ) {}

  async create(createDto: CreateCronogramaDto, userId?: number): Promise<Cronograma> {
    const existing = await this.cronogramaRepository.findOne({
      where: { proyectoId: createDto.proyectoId, codigo: createDto.codigo },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un cronograma con el código ${createDto.codigo} en este proyecto`,
      );
    }

    const cronograma = this.cronogramaRepository.create({
      ...createDto,
      version: createDto.version || 1,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.cronogramaRepository.save(cronograma);
  }

  async findAll(filters?: {
    proyectoId?: number;
    estado?: CronogramaEstado;
    activo?: boolean;
  }): Promise<Cronograma[]> {
    const queryBuilder = this.cronogramaRepository
      .createQueryBuilder('cronograma')
      .orderBy('cronograma.createdAt', 'DESC');

    if (filters?.proyectoId) {
      queryBuilder.andWhere('cronograma.proyectoId = :proyectoId', {
        proyectoId: filters.proyectoId,
      });
    }

    if (filters?.estado) {
      queryBuilder.andWhere('cronograma.estado = :estado', { estado: filters.estado });
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('cronograma.activo = :activo', { activo: filters.activo });
    }

    return queryBuilder.getMany();
  }

  async findByProyecto(proyectoId: number): Promise<Cronograma[]> {
    return this.cronogramaRepository.find({
      where: { proyectoId, activo: true },
      order: { version: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Cronograma> {
    const cronograma = await this.cronogramaRepository.findOne({
      where: { id },
      relations: ['proyecto', 'tareas'],
    });

    if (!cronograma) {
      throw new NotFoundException(`Cronograma con ID ${id} no encontrado`);
    }

    return cronograma;
  }

  async update(
    id: number,
    updateDto: UpdateCronogramaDto,
    userId?: number,
  ): Promise<Cronograma> {
    const cronograma = await this.findOne(id);

    Object.assign(cronograma, updateDto, { updatedBy: userId });

    return this.cronogramaRepository.save(cronograma);
  }

  async cambiarEstado(
    id: number,
    estado: CronogramaEstado,
    userId?: number,
  ): Promise<Cronograma> {
    const cronograma = await this.findOne(id);
    cronograma.estado = estado;
    cronograma.updatedBy = userId;
    return this.cronogramaRepository.save(cronograma);
  }

  async remove(id: number, userId?: number): Promise<Cronograma> {
    const cronograma = await this.findOne(id);
    cronograma.activo = false;
    cronograma.updatedBy = userId;
    return this.cronogramaRepository.save(cronograma);
  }
}
