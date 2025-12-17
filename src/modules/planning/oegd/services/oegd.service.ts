import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Oegd } from '../entities/oegd.entity';
import { CreateOegdDto } from '../dto/create-oegd.dto';
import { UpdateOegdDto } from '../dto/update-oegd.dto';

@Injectable()
export class OegdService {
  constructor(
    @InjectRepository(Oegd)
    private readonly oegdRepository: Repository<Oegd>,
  ) {}

  async create(createOegdDto: CreateOegdDto, userId?: number): Promise<Oegd> {
    const existing = await this.oegdRepository.findOne({
      where: { codigo: createOegdDto.codigo },
    });

    if (existing) {
      throw new ConflictException(`Ya existe un OEGD con el código ${createOegdDto.codigo}`);
    }

    const oegd = this.oegdRepository.create({
      ...createOegdDto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.oegdRepository.save(oegd);
  }

  async findAll(ogdId?: number, activo?: boolean): Promise<Oegd[]> {
    const queryBuilder = this.oegdRepository
      .createQueryBuilder('oegd')
      .leftJoinAndSelect('oegd.ogd', 'ogd')
      .orderBy('oegd.codigo', 'ASC');

    if (ogdId) {
      queryBuilder.andWhere('oegd.ogdId = :ogdId', { ogdId });
    }

    if (activo !== undefined) {
      queryBuilder.andWhere('oegd.activo = :activo', { activo });
    }

    return queryBuilder.getMany();
  }

  async findByOgd(ogdId: number): Promise<Oegd[]> {
    return this.oegdRepository.find({
      where: { ogdId, activo: true },
      order: { codigo: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Oegd> {
    const oegd = await this.oegdRepository.findOne({
      where: { id },
      relations: ['ogd', 'accionesEstrategicas'],
    });

    if (!oegd) {
      throw new NotFoundException(`OEGD con ID ${id} no encontrado`);
    }

    return oegd;
  }

  async update(id: number, updateOegdDto: UpdateOegdDto, userId?: number): Promise<Oegd> {
    const oegd = await this.findOne(id);

    if (updateOegdDto.codigo && updateOegdDto.codigo !== oegd.codigo) {
      const existing = await this.oegdRepository.findOne({
        where: { codigo: updateOegdDto.codigo },
      });
      if (existing) {
        throw new ConflictException(`Ya existe un OEGD con el código ${updateOegdDto.codigo}`);
      }
    }

    Object.assign(oegd, updateOegdDto, { updatedBy: userId });
    return this.oegdRepository.save(oegd);
  }

  async remove(id: number, userId?: number): Promise<Oegd> {
    const oegd = await this.findOne(id);
    oegd.activo = false;
    oegd.updatedBy = userId;
    return this.oegdRepository.save(oegd);
  }
}
