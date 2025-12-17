import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Proyecto } from '../entities/proyecto.entity';
import { CreateProyectoDto } from '../dto/create-proyecto.dto';
import { UpdateProyectoDto } from '../dto/update-proyecto.dto';
import { CambiarEstadoProyectoDto } from '../dto/cambiar-estado.dto';
import { ProyectoEstado } from '../enums/proyecto-estado.enum';

@Injectable()
export class ProyectoService {
  constructor(
    @InjectRepository(Proyecto)
    private readonly proyectoRepository: Repository<Proyecto>,
  ) {}

  async create(createDto: CreateProyectoDto, userId?: number): Promise<Proyecto> {
    const existing = await this.proyectoRepository.findOne({
      where: { codigo: createDto.codigo },
    });

    if (existing) {
      throw new ConflictException(`Ya existe un proyecto con el código ${createDto.codigo}`);
    }

    if (createDto.fechaInicio && createDto.fechaFin) {
      if (new Date(createDto.fechaFin) < new Date(createDto.fechaInicio)) {
        throw new BadRequestException('La fecha de fin debe ser mayor o igual a la fecha de inicio');
      }
    }

    const proyecto = this.proyectoRepository.create({
      ...createDto,
      metodoGestion: 'Scrum',
      createdBy: userId,
      updatedBy: userId,
    });

    return this.proyectoRepository.save(proyecto);
  }

  async findAll(filters?: {
    estado?: ProyectoEstado;
    coordinadorId?: number;
    scrumMasterId?: number;
    accionEstrategicaId?: number;
    activo?: boolean;
  }): Promise<Proyecto[]> {
    const queryBuilder = this.proyectoRepository
      .createQueryBuilder('proyecto')
      .leftJoinAndSelect('proyecto.coordinador', 'coordinador')
      .leftJoinAndSelect('proyecto.scrumMaster', 'scrumMaster')
      .orderBy('proyecto.createdAt', 'DESC');

    if (filters?.estado) {
      queryBuilder.andWhere('proyecto.estado = :estado', { estado: filters.estado });
    }

    if (filters?.coordinadorId) {
      queryBuilder.andWhere('proyecto.coordinadorId = :coordinadorId', { coordinadorId: filters.coordinadorId });
    }

    if (filters?.scrumMasterId) {
      queryBuilder.andWhere('proyecto.scrumMasterId = :scrumMasterId', { scrumMasterId: filters.scrumMasterId });
    }

    if (filters?.accionEstrategicaId) {
      queryBuilder.andWhere('proyecto.accionEstrategicaId = :accionEstrategicaId', { accionEstrategicaId: filters.accionEstrategicaId });
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('proyecto.activo = :activo', { activo: filters.activo });
    }

    return queryBuilder.getMany();
  }

  async findOne(id: number): Promise<Proyecto> {
    const proyecto = await this.proyectoRepository.findOne({
      where: { id },
      relations: [
        'coordinador',
        'scrumMaster',
        'patrocinador',
        'accionEstrategica',
        'subproyectos',
      ],
    });

    if (!proyecto) {
      throw new NotFoundException(`Proyecto con ID ${id} no encontrado`);
    }

    return proyecto;
  }

  async findByCodigo(codigo: string): Promise<Proyecto> {
    const proyecto = await this.proyectoRepository.findOne({
      where: { codigo },
      relations: ['coordinador', 'scrumMaster', 'patrocinador'],
    });

    if (!proyecto) {
      throw new NotFoundException(`Proyecto con código ${codigo} no encontrado`);
    }

    return proyecto;
  }

  async update(id: number, updateDto: UpdateProyectoDto, userId?: number): Promise<Proyecto> {
    const proyecto = await this.findOne(id);

    if (updateDto.fechaInicio && updateDto.fechaFin) {
      if (new Date(updateDto.fechaFin) < new Date(updateDto.fechaInicio)) {
        throw new BadRequestException('La fecha de fin debe ser mayor o igual a la fecha de inicio');
      }
    }

    // Limpiar relaciones si se van a cambiar los IDs
    // Esto es necesario porque TypeORM prioriza las relaciones sobre los campos de ID
    if (updateDto.coordinadorId !== undefined) {
      proyecto.coordinador = null;
    }
    if (updateDto.scrumMasterId !== undefined) {
      proyecto.scrumMaster = null;
    }
    if (updateDto.patrocinadorId !== undefined) {
      proyecto.patrocinador = null;
    }
    if (updateDto.accionEstrategicaId !== undefined) {
      proyecto.accionEstrategica = null;
    }

    Object.assign(proyecto, updateDto, { updatedBy: userId });

    // Guardar y recargar con relaciones
    const saved = await this.proyectoRepository.save(proyecto);
    return this.findOne(saved.id);
  }

  async cambiarEstado(id: number, cambiarEstadoDto: CambiarEstadoProyectoDto, userId?: number): Promise<Proyecto> {
    const proyecto = await this.findOne(id);

    // Validar transiciones de estado permitidas
    const transicionesPermitidas: Record<ProyectoEstado, ProyectoEstado[]> = {
      [ProyectoEstado.PENDIENTE]: [ProyectoEstado.EN_PLANIFICACION, ProyectoEstado.CANCELADO],
      [ProyectoEstado.EN_PLANIFICACION]: [ProyectoEstado.EN_DESARROLLO, ProyectoEstado.CANCELADO],
      [ProyectoEstado.EN_DESARROLLO]: [ProyectoEstado.FINALIZADO, ProyectoEstado.CANCELADO],
      [ProyectoEstado.FINALIZADO]: [],
      [ProyectoEstado.CANCELADO]: [],
    };

    if (!transicionesPermitidas[proyecto.estado]?.includes(cambiarEstadoDto.estado)) {
      throw new BadRequestException(
        `No se puede cambiar el estado de ${proyecto.estado} a ${cambiarEstadoDto.estado}`,
      );
    }

    proyecto.estado = cambiarEstadoDto.estado;
    proyecto.updatedBy = userId;
    return this.proyectoRepository.save(proyecto);
  }

  async remove(id: number, userId?: number): Promise<Proyecto> {
    const proyecto = await this.findOne(id);
    proyecto.activo = false;
    proyecto.updatedBy = userId;
    return this.proyectoRepository.save(proyecto);
  }

  async findByAccionEstrategica(accionEstrategicaId: number): Promise<Proyecto[]> {
    return this.proyectoRepository.find({
      where: { accionEstrategicaId, activo: true },
      order: { codigo: 'ASC' },
    });
  }
}
