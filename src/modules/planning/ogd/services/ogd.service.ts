import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ogd } from '../entities/ogd.entity';
import { OgdOei } from '../../entities/ogd-oei.entity';
import { CreateOgdDto } from '../dto/create-ogd.dto';
import { UpdateOgdDto } from '../dto/update-ogd.dto';

@Injectable()
export class OgdService {
  constructor(
    @InjectRepository(Ogd)
    private readonly ogdRepository: Repository<Ogd>,
    @InjectRepository(OgdOei)
    private readonly ogdOeiRepository: Repository<OgdOei>,
  ) {}

  /**
   * Genera el siguiente código OGD para un PGD dado
   * Formato: "OGD N°X"
   */
  private async generateCodigo(pgdId: number): Promise<string> {
    const count = await this.ogdRepository.count({ where: { pgdId } });
    return `OGD N°${count + 1}`;
  }

  async create(createOgdDto: CreateOgdDto, userId?: number): Promise<Ogd> {
    // Generar código si no se proporciona
    const codigo = createOgdDto.codigo || await this.generateCodigo(createOgdDto.pgdId);

    const existing = await this.ogdRepository.findOne({
      where: { codigo },
    });

    if (existing) {
      throw new ConflictException(`Ya existe un OGD con el código ${codigo}`);
    }

    // Extraer oeiIds para manejar la relación M:N
    const { oeiIds, ...ogdData } = createOgdDto;

    const ogd = this.ogdRepository.create({
      ...ogdData,
      codigo,
      createdBy: userId,
      updatedBy: userId,
    });

    const savedOgd = await this.ogdRepository.save(ogd);

    // Crear relaciones M:N con OEIs
    if (oeiIds && oeiIds.length > 0) {
      await this.syncOeiRelations(savedOgd.id, oeiIds);
    }

    return this.findOne(savedOgd.id);
  }

  async findAll(pgdId?: number, activo?: boolean): Promise<Ogd[]> {
    const queryBuilder = this.ogdRepository
      .createQueryBuilder('ogd')
      .leftJoinAndSelect('ogd.pgd', 'pgd')
      .leftJoinAndSelect('ogd.ogdOeis', 'ogdOeis')
      .leftJoinAndSelect('ogdOeis.oei', 'oei')
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
      relations: ['ogdOeis', 'ogdOeis.oei'],
      order: { codigo: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Ogd> {
    const ogd = await this.ogdRepository.findOne({
      where: { id },
      relations: ['pgd', 'objetivosEspecificos', 'ogdOeis', 'ogdOeis.oei'],
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

    // Extraer oeiIds para manejar la relación M:N
    const { oeiIds, ...ogdData } = updateOgdDto;

    Object.assign(ogd, ogdData, { updatedBy: userId });
    await this.ogdRepository.save(ogd);

    // Actualizar relaciones M:N con OEIs si se proporcionan
    if (oeiIds !== undefined) {
      await this.syncOeiRelations(id, oeiIds);
    }

    return this.findOne(id);
  }

  async remove(id: number, userId?: number): Promise<Ogd> {
    const ogd = await this.findOne(id);
    ogd.activo = false;
    ogd.updatedBy = userId;
    return this.ogdRepository.save(ogd);
  }

  /**
   * Sincroniza las relaciones M:N entre OGD y OEIs
   */
  private async syncOeiRelations(ogdId: number, oeiIds: number[]): Promise<void> {
    // Eliminar relaciones existentes
    await this.ogdOeiRepository.delete({ ogdId });

    // Crear nuevas relaciones
    if (oeiIds.length > 0) {
      const relations = oeiIds.map(oeiId =>
        this.ogdOeiRepository.create({ ogdId, oeiId })
      );
      await this.ogdOeiRepository.save(relations);
    }
  }

  /**
   * Obtiene los IDs de OEIs relacionados con un OGD
   */
  async getOeiIds(ogdId: number): Promise<number[]> {
    const relations = await this.ogdOeiRepository.find({
      where: { ogdId },
      select: ['oeiId'],
    });
    return relations.map(r => r.oeiId);
  }
}
