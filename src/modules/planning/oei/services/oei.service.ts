import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Oei } from '../entities/oei.entity';
import { CreateOeiDto } from '../dto/create-oei.dto';
import { UpdateOeiDto } from '../dto/update-oei.dto';

@Injectable()
export class OeiService {
  constructor(
    @InjectRepository(Oei)
    private readonly oeiRepository: Repository<Oei>,
  ) {}

  async create(createOeiDto: CreateOeiDto, userId?: number): Promise<Oei> {
    const existing = await this.oeiRepository.findOne({
      where: { codigo: createOeiDto.codigo },
    });

    if (existing) {
      throw new ConflictException(`Ya existe un OEI con el código ${createOeiDto.codigo}`);
    }

    const oei = this.oeiRepository.create({
      ...createOeiDto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.oeiRepository.save(oei);
  }

  async findAll(pgdId?: number, activo?: boolean): Promise<Oei[]> {
    const queryBuilder = this.oeiRepository
      .createQueryBuilder('oei')
      .leftJoinAndSelect('oei.pgd', 'pgd')
      .orderBy('oei.codigo', 'ASC');

    if (pgdId) {
      queryBuilder.andWhere('oei.pgdId = :pgdId', { pgdId });
    }

    if (activo !== undefined) {
      queryBuilder.andWhere('oei.activo = :activo', { activo });
    }

    return queryBuilder.getMany();
  }

  async findByPgd(pgdId: number): Promise<Oei[]> {
    return this.oeiRepository.find({
      where: { pgdId, activo: true },
      order: { codigo: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Oei> {
    const oei = await this.oeiRepository.findOne({
      where: { id },
      relations: ['pgd'],
    });

    if (!oei) {
      throw new NotFoundException(`OEI con ID ${id} no encontrado`);
    }

    return oei;
  }

  async update(id: number, updateOeiDto: UpdateOeiDto, userId?: number): Promise<Oei> {
    const oei = await this.findOne(id);

    if (updateOeiDto.codigo && updateOeiDto.codigo !== oei.codigo) {
      const existing = await this.oeiRepository.findOne({
        where: { codigo: updateOeiDto.codigo },
      });
      if (existing) {
        throw new ConflictException(`Ya existe un OEI con el código ${updateOeiDto.codigo}`);
      }
    }

    Object.assign(oei, updateOeiDto, { updatedBy: userId });
    return this.oeiRepository.save(oei);
  }

  async remove(id: number, userId?: number): Promise<Oei> {
    const oei = await this.findOne(id);
    oei.activo = false;
    oei.updatedBy = userId;
    return this.oeiRepository.save(oei);
  }
}
