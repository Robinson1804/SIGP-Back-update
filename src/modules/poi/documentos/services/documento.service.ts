import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Documento } from '../entities/documento.entity';
import { CreateDocumentoDto } from '../dto/create-documento.dto';
import { UpdateDocumentoDto } from '../dto/update-documento.dto';
import { AprobarDocumentoDto } from '../dto/aprobar-documento.dto';
import { DocumentoFase, DocumentoEstado, TipoContenedor } from '../enums/documento.enum';

@Injectable()
export class DocumentoService {
  constructor(
    @InjectRepository(Documento)
    private readonly documentoRepository: Repository<Documento>,
  ) {}

  async create(createDto: CreateDocumentoDto, userId?: number): Promise<Documento> {
    // Validar relación polimórfica
    if (createDto.tipoContenedor === TipoContenedor.PROYECTO && !createDto.proyectoId) {
      throw new BadRequestException('proyectoId es requerido para tipo PROYECTO');
    }
    if (createDto.tipoContenedor === TipoContenedor.SUBPROYECTO && !createDto.subproyectoId) {
      throw new BadRequestException('subproyectoId es requerido para tipo SUBPROYECTO');
    }

    const documento = this.documentoRepository.create({
      ...createDto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.documentoRepository.save(documento);
  }

  async findAll(filters?: {
    proyectoId?: number;
    subproyectoId?: number;
    fase?: DocumentoFase;
    estado?: DocumentoEstado;
    activo?: boolean;
  }): Promise<Documento[]> {
    const queryBuilder = this.documentoRepository
      .createQueryBuilder('documento')
      .orderBy('documento.fase', 'ASC')
      .addOrderBy('documento.nombre', 'ASC');

    if (filters?.proyectoId) {
      queryBuilder.andWhere('documento.proyectoId = :proyectoId', { proyectoId: filters.proyectoId });
    }

    if (filters?.subproyectoId) {
      queryBuilder.andWhere('documento.subproyectoId = :subproyectoId', { subproyectoId: filters.subproyectoId });
    }

    if (filters?.fase) {
      queryBuilder.andWhere('documento.fase = :fase', { fase: filters.fase });
    }

    if (filters?.estado) {
      queryBuilder.andWhere('documento.estado = :estado', { estado: filters.estado });
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('documento.activo = :activo', { activo: filters.activo });
    }

    return queryBuilder.getMany();
  }

  async findByProyecto(proyectoId: number): Promise<Documento[]> {
    return this.documentoRepository.find({
      where: { proyectoId, activo: true },
      order: { fase: 'ASC', nombre: 'ASC' },
    });
  }

  async findBySubproyecto(subproyectoId: number): Promise<Documento[]> {
    return this.documentoRepository.find({
      where: { subproyectoId, activo: true },
      order: { fase: 'ASC', nombre: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Documento> {
    const documento = await this.documentoRepository.findOne({
      where: { id },
      relations: ['proyecto', 'subproyecto', 'aprobador'],
    });

    if (!documento) {
      throw new NotFoundException(`Documento con ID ${id} no encontrado`);
    }

    return documento;
  }

  async update(id: number, updateDto: UpdateDocumentoDto, userId?: number): Promise<Documento> {
    const documento = await this.findOne(id);
    Object.assign(documento, updateDto, { updatedBy: userId });
    return this.documentoRepository.save(documento);
  }

  async aprobar(id: number, aprobarDto: AprobarDocumentoDto, userId: number): Promise<Documento> {
    const documento = await this.findOne(id);

    documento.estado = aprobarDto.estado;
    documento.observacionAprobacion = aprobarDto.observacion ?? null;
    documento.aprobadoPor = userId;
    documento.fechaAprobacion = new Date();
    documento.updatedBy = userId;

    return this.documentoRepository.save(documento);
  }

  async remove(id: number, userId?: number): Promise<Documento> {
    const documento = await this.findOne(id);
    documento.activo = false;
    documento.updatedBy = userId;
    return this.documentoRepository.save(documento);
  }
}
