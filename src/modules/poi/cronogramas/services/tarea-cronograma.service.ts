import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TareaCronograma } from '../entities/tarea-cronograma.entity';
import { CreateTareaCronogramaDto } from '../dto/create-tarea-cronograma.dto';
import { UpdateTareaCronogramaDto } from '../dto/update-tarea-cronograma.dto';
import { TareaEstado } from '../enums/cronograma.enum';

@Injectable()
export class TareaCronogramaService {
  constructor(
    @InjectRepository(TareaCronograma)
    private readonly tareaCronogramaRepository: Repository<TareaCronograma>,
  ) {}

  async create(createDto: CreateTareaCronogramaDto, userId?: number): Promise<TareaCronograma> {
    const existing = await this.tareaCronogramaRepository.findOne({
      where: { cronogramaId: createDto.cronogramaId, codigo: createDto.codigo },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una tarea con el código ${createDto.codigo} en este cronograma`,
      );
    }

    const tarea = this.tareaCronogramaRepository.create({
      ...createDto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.tareaCronogramaRepository.save(tarea);
  }

  async findByCronograma(cronogramaId: number): Promise<TareaCronograma[]> {
    return this.tareaCronogramaRepository.find({
      where: { cronogramaId, activo: true },
      relations: ['responsable'],
      order: { orden: 'ASC', fechaInicio: 'ASC' },
    });
  }

  async findOne(id: number): Promise<TareaCronograma> {
    const tarea = await this.tareaCronogramaRepository.findOne({
      where: { id },
      relations: ['cronograma', 'responsable', 'tareaPadre'],
    });

    if (!tarea) {
      throw new NotFoundException(`Tarea con ID ${id} no encontrada`);
    }

    return tarea;
  }

  async update(
    id: number,
    updateDto: UpdateTareaCronogramaDto,
    userId?: number,
  ): Promise<TareaCronograma> {
    const tarea = await this.findOne(id);

    Object.assign(tarea, updateDto, { updatedBy: userId });

    // Auto-update estado based on porcentajeAvance
    if (updateDto.porcentajeAvance !== undefined) {
      if (updateDto.porcentajeAvance >= 100) {
        tarea.estado = TareaEstado.COMPLETADA;
        if (!tarea.fechaFinReal) {
          tarea.fechaFinReal = new Date();
        }
      } else if (updateDto.porcentajeAvance > 0 && tarea.estado === TareaEstado.PENDIENTE) {
        tarea.estado = TareaEstado.EN_PROGRESO;
        if (!tarea.fechaInicioReal) {
          tarea.fechaInicioReal = new Date();
        }
      }
    }

    return this.tareaCronogramaRepository.save(tarea);
  }

  async remove(id: number, userId?: number): Promise<TareaCronograma> {
    const tarea = await this.findOne(id);
    tarea.activo = false;
    tarea.updatedBy = userId;
    return this.tareaCronogramaRepository.save(tarea);
  }
}
