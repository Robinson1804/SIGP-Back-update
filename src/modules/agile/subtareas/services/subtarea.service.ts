import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subtarea } from '../entities/subtarea.entity';
import { Tarea } from '../../tareas/entities/tarea.entity';
import { CreateSubtareaDto } from '../dto/create-subtarea.dto';
import { UpdateSubtareaDto } from '../dto/update-subtarea.dto';
import { TareaTipo } from '../../tareas/enums/tarea.enum';

@Injectable()
export class SubtareaService {
  constructor(
    @InjectRepository(Subtarea)
    private readonly subtareaRepository: Repository<Subtarea>,
    @InjectRepository(Tarea)
    private readonly tareaRepository: Repository<Tarea>,
  ) {}

  async create(createDto: CreateSubtareaDto, userId?: number): Promise<Subtarea> {
    // Verify tarea exists and is KANBAN type
    const tarea = await this.tareaRepository.findOne({
      where: { id: createDto.tareaId },
    });

    if (!tarea) {
      throw new NotFoundException(`Tarea con ID ${createDto.tareaId} no encontrada`);
    }

    if (tarea.tipo !== TareaTipo.KANBAN) {
      throw new BadRequestException('Solo se pueden crear subtareas para tareas de tipo KANBAN');
    }

    // Check for duplicate code within the same tarea
    const existing = await this.subtareaRepository.findOne({
      where: { tareaId: createDto.tareaId, codigo: createDto.codigo },
    });

    if (existing) {
      throw new ConflictException(`Ya existe una subtarea con el código ${createDto.codigo} en esta tarea`);
    }

    const subtarea = this.subtareaRepository.create({
      ...createDto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.subtareaRepository.save(subtarea);
  }

  async findAll(tareaId?: number): Promise<Subtarea[]> {
    const queryBuilder = this.subtareaRepository
      .createQueryBuilder('subtarea')
      .leftJoinAndSelect('subtarea.responsable', 'responsable')
      .where('subtarea.activo = :activo', { activo: true })
      .orderBy('subtarea.prioridad', 'ASC')
      .addOrderBy('subtarea.createdAt', 'DESC');

    if (tareaId) {
      queryBuilder.andWhere('subtarea.tareaId = :tareaId', { tareaId });
    }

    return queryBuilder.getMany();
  }

  async findByTarea(tareaId: number): Promise<Subtarea[]> {
    // Verify tarea exists and is KANBAN type
    const tarea = await this.tareaRepository.findOne({
      where: { id: tareaId },
    });

    if (!tarea) {
      throw new NotFoundException(`Tarea con ID ${tareaId} no encontrada`);
    }

    if (tarea.tipo !== TareaTipo.KANBAN) {
      throw new BadRequestException('Solo las tareas KANBAN pueden tener subtareas');
    }

    return this.subtareaRepository.find({
      where: { tareaId, activo: true },
      relations: ['responsable'],
      order: { prioridad: 'ASC', createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Subtarea> {
    const subtarea = await this.subtareaRepository.findOne({
      where: { id },
      relations: ['tarea', 'responsable'],
    });

    if (!subtarea) {
      throw new NotFoundException(`Subtarea con ID ${id} no encontrada`);
    }

    return subtarea;
  }

  async update(id: number, updateDto: UpdateSubtareaDto, userId?: number): Promise<Subtarea> {
    const subtarea = await this.findOne(id);

    // Check for duplicate code if updating
    if (updateDto.codigo && updateDto.codigo !== subtarea.codigo) {
      const existing = await this.subtareaRepository.findOne({
        where: { tareaId: subtarea.tareaId, codigo: updateDto.codigo },
      });

      if (existing) {
        throw new ConflictException(`Ya existe una subtarea con el código ${updateDto.codigo} en esta tarea`);
      }
    }

    Object.assign(subtarea, updateDto, { updatedBy: userId });

    return this.subtareaRepository.save(subtarea);
  }

  async remove(id: number, userId?: number): Promise<Subtarea> {
    const subtarea = await this.findOne(id);
    subtarea.activo = false;
    subtarea.updatedBy = userId;
    return this.subtareaRepository.save(subtarea);
  }

  async getEstadisticasByTarea(tareaId: number): Promise<{
    total: number;
    porEstado: Record<string, number>;
    horasEstimadas: number;
    horasReales: number;
    progreso: number;
  }> {
    const subtareas = await this.subtareaRepository.find({
      where: { tareaId, activo: true },
    });

    const porEstado: Record<string, number> = {};
    let horasEstimadas = 0;
    let horasReales = 0;
    let completadas = 0;

    subtareas.forEach((st) => {
      porEstado[st.estado] = (porEstado[st.estado] || 0) + 1;
      horasEstimadas += Number(st.horasEstimadas) || 0;
      horasReales += Number(st.horasReales) || 0;
      if (st.estado === 'Finalizado') {
        completadas++;
      }
    });

    return {
      total: subtareas.length,
      porEstado,
      horasEstimadas,
      horasReales,
      progreso: subtareas.length > 0 ? Math.round((completadas / subtareas.length) * 100) : 0,
    };
  }
}
