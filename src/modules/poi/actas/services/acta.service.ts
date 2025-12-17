import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Acta } from '../entities/acta.entity';
import { CreateActaReunionDto } from '../dto/create-acta-reunion.dto';
import { CreateActaConstitucionDto } from '../dto/create-acta-constitucion.dto';
import { AprobarActaDto } from '../dto/aprobar-acta.dto';
import { ActaTipo, ActaEstado } from '../enums/acta.enum';

@Injectable()
export class ActaService {
  constructor(
    @InjectRepository(Acta)
    private readonly actaRepository: Repository<Acta>,
  ) {}

  async createReunion(createDto: CreateActaReunionDto, userId?: number): Promise<Acta> {
    const existing = await this.actaRepository.findOne({
      where: { proyectoId: createDto.proyectoId, codigo: createDto.codigo },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un acta con el código ${createDto.codigo} en este proyecto`,
      );
    }

    const acta = this.actaRepository.create({
      ...createDto,
      tipo: ActaTipo.REUNION,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.actaRepository.save(acta);
  }

  async createConstitucion(createDto: CreateActaConstitucionDto, userId?: number): Promise<Acta> {
    const existing = await this.actaRepository.findOne({
      where: { proyectoId: createDto.proyectoId, codigo: createDto.codigo },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un acta con el código ${createDto.codigo} en este proyecto`,
      );
    }

    const acta = this.actaRepository.create({
      ...createDto,
      tipo: ActaTipo.CONSTITUCION,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.actaRepository.save(acta);
  }

  async findAll(filters?: {
    proyectoId?: number;
    tipo?: ActaTipo;
    estado?: ActaEstado;
    activo?: boolean;
  }): Promise<Acta[]> {
    const queryBuilder = this.actaRepository
      .createQueryBuilder('acta')
      .orderBy('acta.fecha', 'DESC');

    if (filters?.proyectoId) {
      queryBuilder.andWhere('acta.proyectoId = :proyectoId', { proyectoId: filters.proyectoId });
    }

    if (filters?.tipo) {
      queryBuilder.andWhere('acta.tipo = :tipo', { tipo: filters.tipo });
    }

    if (filters?.estado) {
      queryBuilder.andWhere('acta.estado = :estado', { estado: filters.estado });
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('acta.activo = :activo', { activo: filters.activo });
    }

    return queryBuilder.getMany();
  }

  async findByProyecto(proyectoId: number): Promise<Acta[]> {
    return this.actaRepository.find({
      where: { proyectoId, activo: true },
      order: { fecha: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Acta> {
    const acta = await this.actaRepository.findOne({
      where: { id },
      relations: ['proyecto', 'aprobador'],
    });

    if (!acta) {
      throw new NotFoundException(`Acta con ID ${id} no encontrada`);
    }

    return acta;
  }

  async aprobar(id: number, aprobarDto: AprobarActaDto, userId: number): Promise<Acta> {
    const acta = await this.findOne(id);

    acta.estado = aprobarDto.estado;
    acta.aprobadoPor = userId;
    acta.fechaAprobacion = new Date();
    acta.updatedBy = userId;

    return this.actaRepository.save(acta);
  }

  async remove(id: number, userId?: number): Promise<Acta> {
    const acta = await this.findOne(id);
    acta.activo = false;
    acta.updatedBy = userId;
    return this.actaRepository.save(acta);
  }
}
