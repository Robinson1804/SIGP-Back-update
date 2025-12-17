import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ogd } from '../entities/ogd.entity';
import { CreateOgdDto } from '../dto/create-ogd.dto';
import { UpdateOgdDto } from '../dto/update-ogd.dto';

@Injectable()
export class OgdService {
  constructor(
    @InjectRepository(Ogd)
    private readonly ogdRepository: Repository<Ogd>,
  ) {}

  async create(createOgdDto: CreateOgdDto, userId?: number): Promise<Ogd> {
    const existing = await this.ogdRepository.findOne({
      where: { codigo: createOgdDto.codigo },
    });

    if (existing) {
      throw new ConflictException(`Ya existe un OGD con el código ${createOgdDto.codigo}`);
    }

    const ogd = this.ogdRepository.create({
      ...createOgdDto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.ogdRepository.save(ogd);
  }

  async findAll(pgdId?: number, activo?: boolean): Promise<Ogd[]> {
    const queryBuilder = this.ogdRepository
      .createQueryBuilder('ogd')
      .leftJoinAndSelect('ogd.pgd', 'pgd')
      .orderBy('ogd.codigo', 'ASC');

    if (pgdId) {
      queryBuilder.andWhere('ogd.pgdId = :pgdId', { pgdId });
    }

    if (activo !== undefined) {
      queryBuilder.andWhere('ogd.activo = :activo', { activo });
    }

    return queryBuilder.getMany();
  }

  async findByPgd(pgdId: number): Promise<Ogd[]> {
    return this.ogdRepository.find({
      where: { pgdId, activo: true },
      order: { codigo: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Ogd> {
    const ogd = await this.ogdRepository.findOne({
      where: { id },
      relations: ['pgd', 'objetivosEspecificos'],
    });

    if (!ogd) {
      throw new NotFoundException(`OGD con ID ${id} no encontrado`);
    }

    return ogd;
  }

  async update(id: number, updateOgdDto: UpdateOgdDto, userId?: number): Promise<Ogd> {
    const ogd = await this.findOne(id);

    if (updateOgdDto.codigo && updateOgdDto.codigo !== ogd.codigo) {
      const existing = await this.ogdRepository.findOne({
        where: { codigo: updateOgdDto.codigo },
      });
      if (existing) {
        throw new ConflictException(`Ya existe un OGD con el código ${updateOgdDto.codigo}`);
      }
    }

    Object.assign(ogd, updateOgdDto, { updatedBy: userId });
    return this.ogdRepository.save(ogd);
  }

  async remove(id: number, userId?: number): Promise<Ogd> {
    const ogd = await this.findOne(id);
    ogd.activo = false;
    ogd.updatedBy = userId;
    return this.ogdRepository.save(ogd);
  }
}
