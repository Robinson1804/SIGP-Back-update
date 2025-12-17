import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccionEstrategica } from '../entities/accion-estrategica.entity';
import { CreateAccionEstrategicaDto } from '../dto/create-accion-estrategica.dto';
import { UpdateAccionEstrategicaDto } from '../dto/update-accion-estrategica.dto';

@Injectable()
export class AccionEstrategicaService {
  constructor(
    @InjectRepository(AccionEstrategica)
    private readonly accionEstrategicaRepository: Repository<AccionEstrategica>,
  ) {}

  async create(createDto: CreateAccionEstrategicaDto, userId?: number): Promise<AccionEstrategica> {
    const existing = await this.accionEstrategicaRepository.findOne({
      where: { codigo: createDto.codigo },
    });

    if (existing) {
      throw new ConflictException(`Ya existe una Acción Estratégica con el código ${createDto.codigo}`);
    }

    const accion = this.accionEstrategicaRepository.create({
      ...createDto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.accionEstrategicaRepository.save(accion);
  }

  async findAll(oegdId?: number, activo?: boolean): Promise<AccionEstrategica[]> {
    const queryBuilder = this.accionEstrategicaRepository
      .createQueryBuilder('ae')
      .leftJoinAndSelect('ae.oegd', 'oegd')
      .leftJoinAndSelect('oegd.ogd', 'ogd')
      .orderBy('ae.codigo', 'ASC');

    if (oegdId) {
      queryBuilder.andWhere('ae.oegdId = :oegdId', { oegdId });
    }

    if (activo !== undefined) {
      queryBuilder.andWhere('ae.activo = :activo', { activo });
    }

    return queryBuilder.getMany();
  }

  async findByOegd(oegdId: number): Promise<AccionEstrategica[]> {
    return this.accionEstrategicaRepository.find({
      where: { oegdId, activo: true },
      order: { codigo: 'ASC' },
    });
  }

  async findOne(id: number): Promise<AccionEstrategica> {
    const accion = await this.accionEstrategicaRepository.findOne({
      where: { id },
      relations: ['oegd', 'oegd.ogd'],
    });

    if (!accion) {
      throw new NotFoundException(`Acción Estratégica con ID ${id} no encontrada`);
    }

    return accion;
  }

  async update(id: number, updateDto: UpdateAccionEstrategicaDto, userId?: number): Promise<AccionEstrategica> {
    const accion = await this.findOne(id);

    if (updateDto.codigo && updateDto.codigo !== accion.codigo) {
      const existing = await this.accionEstrategicaRepository.findOne({
        where: { codigo: updateDto.codigo },
      });
      if (existing) {
        throw new ConflictException(`Ya existe una Acción Estratégica con el código ${updateDto.codigo}`);
      }
    }

    Object.assign(accion, updateDto, { updatedBy: userId });
    return this.accionEstrategicaRepository.save(accion);
  }

  async remove(id: number, userId?: number): Promise<AccionEstrategica> {
    const accion = await this.findOne(id);
    accion.activo = false;
    accion.updatedBy = userId;
    return this.accionEstrategicaRepository.save(accion);
  }
}
