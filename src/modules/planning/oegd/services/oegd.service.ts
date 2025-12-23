import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Oegd } from '../entities/oegd.entity';
import { OegdAei } from '../../entities/oegd-aei.entity';
import { CreateOegdDto } from '../dto/create-oegd.dto';
import { UpdateOegdDto } from '../dto/update-oegd.dto';

@Injectable()
export class OegdService {
  constructor(
    @InjectRepository(Oegd)
    private readonly oegdRepository: Repository<Oegd>,
    @InjectRepository(OegdAei)
    private readonly oegdAeiRepository: Repository<OegdAei>,
  ) {}

  /**
   * Genera el siguiente código OEGD para un OGD dado
   * Formato: "OEGD N°X"
   */
  private async generateCodigo(ogdId: number): Promise<string> {
    const count = await this.oegdRepository.count({ where: { ogdId } });
    return `OEGD N°${count + 1}`;
  }

  async create(createOegdDto: CreateOegdDto, userId?: number): Promise<Oegd> {
    // Generar código si no se proporciona
    const codigo = createOegdDto.codigo || await this.generateCodigo(createOegdDto.ogdId);

    const existing = await this.oegdRepository.findOne({
      where: { codigo },
    });

    if (existing) {
      throw new ConflictException(`Ya existe un OEGD con el código ${codigo}`);
    }

    // Extraer aeiIds para manejar la relación M:N
    const { aeiIds, ...oegdData } = createOegdDto;

    const oegd = this.oegdRepository.create({
      ...oegdData,
      codigo,
      createdBy: userId,
      updatedBy: userId,
    });

    const savedOegd = await this.oegdRepository.save(oegd);

    // Crear relaciones M:N con AEIs
    if (aeiIds && aeiIds.length > 0) {
      await this.syncAeiRelations(savedOegd.id, aeiIds);
    }

    return this.findOne(savedOegd.id);
  }

  async findAll(ogdId?: number, activo?: boolean): Promise<Oegd[]> {
    const queryBuilder = this.oegdRepository
      .createQueryBuilder('oegd')
      .leftJoinAndSelect('oegd.ogd', 'ogd')
      .leftJoinAndSelect('oegd.oegdAeis', 'oegdAeis')
      .leftJoinAndSelect('oegdAeis.aei', 'aei')
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
      relations: ['oegdAeis', 'oegdAeis.aei'],
      order: { codigo: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Oegd> {
    const oegd = await this.oegdRepository.findOne({
      where: { id },
      relations: ['ogd', 'accionesEstrategicas', 'oegdAeis', 'oegdAeis.aei'],
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

    // Extraer aeiIds para manejar la relación M:N
    const { aeiIds, ...oegdData } = updateOegdDto;

    Object.assign(oegd, oegdData, { updatedBy: userId });
    await this.oegdRepository.save(oegd);

    // Actualizar relaciones M:N con AEIs si se proporcionan
    if (aeiIds !== undefined) {
      await this.syncAeiRelations(id, aeiIds);
    }

    return this.findOne(id);
  }

  async remove(id: number, userId?: number): Promise<Oegd> {
    const oegd = await this.findOne(id);
    oegd.activo = false;
    oegd.updatedBy = userId;
    return this.oegdRepository.save(oegd);
  }

  /**
   * Sincroniza las relaciones M:N entre OEGD y AEIs
   */
  private async syncAeiRelations(oegdId: number, aeiIds: number[]): Promise<void> {
    // Eliminar relaciones existentes
    await this.oegdAeiRepository.delete({ oegdId });

    // Crear nuevas relaciones
    if (aeiIds.length > 0) {
      const relations = aeiIds.map(aeiId =>
        this.oegdAeiRepository.create({ oegdId, aeiId })
      );
      await this.oegdAeiRepository.save(relations);
    }
  }

  /**
   * Obtiene los IDs de AEIs relacionadas con un OEGD
   */
  async getAeiIds(oegdId: number): Promise<number[]> {
    const relations = await this.oegdAeiRepository.find({
      where: { oegdId },
      select: ['aeiId'],
    });
    return relations.map(r => r.aeiId);
  }
}
