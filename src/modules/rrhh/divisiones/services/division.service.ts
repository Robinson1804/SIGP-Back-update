import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Division } from '../entities/division.entity';
import { CreateDivisionDto } from '../dto/create-division.dto';
import { UpdateDivisionDto } from '../dto/update-division.dto';
import { DivisionTreeResponseDto } from '../dto/division-response.dto';

@Injectable()
export class DivisionService {
  constructor(
    @InjectRepository(Division)
    private readonly divisionRepository: Repository<Division>,
  ) {}

  async create(createDto: CreateDivisionDto, userId?: number): Promise<Division> {
    // Check for duplicate code
    const existing = await this.divisionRepository.findOne({
      where: { codigo: createDto.codigo },
    });

    if (existing) {
      throw new ConflictException(`Ya existe una división con el código ${createDto.codigo}`);
    }

    // Validate parent division exists if provided
    if (createDto.divisionPadreId) {
      const padre = await this.divisionRepository.findOne({
        where: { id: createDto.divisionPadreId },
      });
      if (!padre) {
        throw new BadRequestException(`División padre con ID ${createDto.divisionPadreId} no encontrada`);
      }
    }

    const division = this.divisionRepository.create({
      ...createDto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.divisionRepository.save(division);
  }

  async findAll(activo?: boolean): Promise<Division[]> {
    const queryBuilder = this.divisionRepository
      .createQueryBuilder('division')
      .leftJoinAndSelect('division.jefe', 'jefe')
      .leftJoinAndSelect('division.divisionPadre', 'padre')
      .orderBy('division.codigo', 'ASC');

    if (activo !== undefined) {
      queryBuilder.andWhere('division.activo = :activo', { activo });
    }

    return queryBuilder.getMany();
  }

  async findOne(id: number): Promise<Division> {
    const division = await this.divisionRepository.findOne({
      where: { id },
      relations: ['jefe', 'divisionPadre', 'hijos'],
    });

    if (!division) {
      throw new NotFoundException(`División con ID ${id} no encontrada`);
    }

    return division;
  }

  async getArbol(): Promise<DivisionTreeResponseDto[]> {
    const divisiones = await this.divisionRepository.find({
      where: { activo: true },
      relations: ['jefe'],
      order: { codigo: 'ASC' },
    });

    // Build tree recursively starting from root divisions (no parent)
    return this.buildTree(divisiones, null);
  }

  private buildTree(
    divisiones: Division[],
    parentId: number | null,
  ): DivisionTreeResponseDto[] {
    return divisiones
      .filter((d) => d.divisionPadreId === parentId)
      .map((division) => ({
        id: division.id,
        codigo: division.codigo,
        nombre: division.nombre,
        descripcion: division.descripcion,
        divisionPadreId: division.divisionPadreId,
        jefeId: division.jefeId,
        activo: division.activo,
        createdAt: division.createdAt,
        updatedAt: division.updatedAt,
        jefe: division.jefe
          ? {
              id: division.jefe.id,
              nombres: division.jefe.nombres,
              apellidos: division.jefe.apellidos,
              cargo: division.jefe.cargo,
            }
          : undefined,
        hijos: this.buildTree(divisiones, division.id),
      }));
  }

  async update(id: number, updateDto: UpdateDivisionDto, userId?: number): Promise<Division> {
    const division = await this.findOne(id);

    // Prevent circular reference
    if (updateDto.divisionPadreId) {
      if (updateDto.divisionPadreId === id) {
        throw new BadRequestException('Una división no puede ser su propio padre');
      }

      // Check if the new parent is a descendant of this division
      const isDescendant = await this.isDescendant(updateDto.divisionPadreId, id);
      if (isDescendant) {
        throw new BadRequestException('No se puede asignar un descendiente como padre');
      }

      const padre = await this.divisionRepository.findOne({
        where: { id: updateDto.divisionPadreId },
      });
      if (!padre) {
        throw new BadRequestException(`División padre con ID ${updateDto.divisionPadreId} no encontrada`);
      }
    }

    Object.assign(division, updateDto, { updatedBy: userId });

    return this.divisionRepository.save(division);
  }

  private async isDescendant(divisionId: number, potentialAncestorId: number): Promise<boolean> {
    const division = await this.divisionRepository.findOne({
      where: { id: divisionId },
    });

    if (!division || !division.divisionPadreId) {
      return false;
    }

    if (division.divisionPadreId === potentialAncestorId) {
      return true;
    }

    return this.isDescendant(division.divisionPadreId, potentialAncestorId);
  }

  async remove(id: number, userId?: number): Promise<Division> {
    const division = await this.findOne(id);

    // Check if division has children
    const children = await this.divisionRepository.find({
      where: { divisionPadreId: id, activo: true },
    });

    if (children.length > 0) {
      throw new BadRequestException('No se puede eliminar una división con subdivisiones activas');
    }

    division.activo = false;
    division.updatedBy = userId;
    return this.divisionRepository.save(division);
  }
}
