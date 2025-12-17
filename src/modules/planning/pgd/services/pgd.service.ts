import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pgd, PgdEstado } from '../entities/pgd.entity';
import { CreatePgdDto } from '../dto/create-pgd.dto';
import { UpdatePgdDto } from '../dto/update-pgd.dto';
import { FilterPgdDto } from '../dto/filter-pgd.dto';

@Injectable()
export class PgdService {
  constructor(
    @InjectRepository(Pgd)
    private readonly pgdRepository: Repository<Pgd>,
  ) {}

  async create(createPgdDto: CreatePgdDto, userId?: number): Promise<Pgd> {
    if (createPgdDto.anioFin <= createPgdDto.anioInicio) {
      throw new ConflictException('El año de fin debe ser mayor al año de inicio');
    }

    const pgd = this.pgdRepository.create({
      ...createPgdDto,
      estado: createPgdDto.estado || PgdEstado.BORRADOR,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.pgdRepository.save(pgd);
  }

  async findAll(filterDto: FilterPgdDto): Promise<{ data: Pgd[]; total: number }> {
    const { estado, anio, activo, page = 1, limit = 10 } = filterDto;

    const queryBuilder = this.pgdRepository
      .createQueryBuilder('pgd')
      .orderBy('pgd.anioInicio', 'DESC');

    if (estado) {
      queryBuilder.andWhere('pgd.estado = :estado', { estado });
    }

    if (anio) {
      queryBuilder.andWhere(':anio BETWEEN pgd.anioInicio AND pgd.anioFin', { anio });
    }

    if (activo !== undefined) {
      queryBuilder.andWhere('pgd.activo = :activo', { activo });
    }

    const total = await queryBuilder.getCount();
    const data = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { data, total };
  }

  async findOne(id: number): Promise<Pgd> {
    const pgd = await this.pgdRepository.findOne({
      where: { id },
      relations: ['objetivosEstrategicos', 'objetivosGobiernoDigital'],
    });

    if (!pgd) {
      throw new NotFoundException(`PGD con ID ${id} no encontrado`);
    }

    return pgd;
  }

  async findVigente(): Promise<Pgd | null> {
    return this.pgdRepository.findOne({
      where: { estado: PgdEstado.VIGENTE, activo: true },
      relations: ['objetivosEstrategicos', 'objetivosGobiernoDigital'],
    });
  }

  async update(id: number, updatePgdDto: UpdatePgdDto, userId?: number): Promise<Pgd> {
    const pgd = await this.findOne(id);

    if (updatePgdDto.anioFin && updatePgdDto.anioInicio) {
      if (updatePgdDto.anioFin <= updatePgdDto.anioInicio) {
        throw new ConflictException('El año de fin debe ser mayor al año de inicio');
      }
    } else if (updatePgdDto.anioFin && updatePgdDto.anioFin <= pgd.anioInicio) {
      throw new ConflictException('El año de fin debe ser mayor al año de inicio');
    } else if (updatePgdDto.anioInicio && pgd.anioFin <= updatePgdDto.anioInicio) {
      throw new ConflictException('El año de inicio debe ser menor al año de fin');
    }

    Object.assign(pgd, updatePgdDto, { updatedBy: userId });
    return this.pgdRepository.save(pgd);
  }

  async remove(id: number, userId?: number): Promise<Pgd> {
    const pgd = await this.findOne(id);
    pgd.activo = false;
    pgd.updatedBy = userId;
    return this.pgdRepository.save(pgd);
  }

  async setVigente(id: number, userId?: number): Promise<Pgd> {
    const pgd = await this.findOne(id);

    // Desactivar otros PGDs vigentes
    await this.pgdRepository.update(
      { estado: PgdEstado.VIGENTE },
      { estado: PgdEstado.FINALIZADO, updatedBy: userId },
    );

    pgd.estado = PgdEstado.VIGENTE;
    pgd.updatedBy = userId;
    return this.pgdRepository.save(pgd);
  }
}
