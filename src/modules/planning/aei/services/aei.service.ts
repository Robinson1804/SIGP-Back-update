import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Aei } from '../entities/aei.entity';
import { CreateAeiDto } from '../dto/create-aei.dto';
import { UpdateAeiDto } from '../dto/update-aei.dto';
import { Oei } from '../../oei/entities/oei.entity';

@Injectable()
export class AeiService {
  constructor(
    @InjectRepository(Aei)
    private readonly aeiRepository: Repository<Aei>,
    @InjectRepository(Oei)
    private readonly oeiRepository: Repository<Oei>,
  ) {}

  /**
   * Genera el siguiente código AEI para un OEI dado
   * Formato: AEI.XX.YY donde XX es el número del OEI y YY es secuencial
   */
  private async generateCodigo(oeiId: number): Promise<string> {
    // Obtener el OEI para extraer su número
    const oei = await this.oeiRepository.findOne({ where: { id: oeiId } });
    if (!oei) {
      throw new NotFoundException(`OEI con ID ${oeiId} no encontrado`);
    }

    // Extraer número del código OEI (ej: "OEI N°1" → 1)
    const oeiMatch = oei.codigo.match(/(\d+)/);
    const oeiNum = oeiMatch ? oeiMatch[1].padStart(2, '0') : '01';

    // Contar AEIs existentes para este OEI
    const count = await this.aeiRepository.count({ where: { oeiId } });
    const aeiNum = String(count + 1).padStart(2, '0');

    return `AEI.${oeiNum}.${aeiNum}`;
  }

  async create(createAeiDto: CreateAeiDto, userId?: number): Promise<Aei> {
    // Verificar que el OEI existe
    const oei = await this.oeiRepository.findOne({
      where: { id: createAeiDto.oeiId },
    });
    if (!oei) {
      throw new NotFoundException(`OEI con ID ${createAeiDto.oeiId} no encontrado`);
    }

    // Generar código si no se proporciona
    const codigo = createAeiDto.codigo || await this.generateCodigo(createAeiDto.oeiId);

    // Verificar que el código no existe
    const existing = await this.aeiRepository.findOne({
      where: { codigo },
    });

    if (existing) {
      throw new ConflictException(`Ya existe una AEI con el código ${codigo}`);
    }

    const aei = this.aeiRepository.create({
      ...createAeiDto,
      codigo,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.aeiRepository.save(aei);
  }

  async findAll(oeiId?: number, activo?: boolean): Promise<Aei[]> {
    const queryBuilder = this.aeiRepository
      .createQueryBuilder('aei')
      .leftJoinAndSelect('aei.oei', 'oei')
      .orderBy('aei.codigo', 'ASC');

    if (oeiId) {
      queryBuilder.andWhere('aei.oeiId = :oeiId', { oeiId });
    }

    if (activo !== undefined) {
      queryBuilder.andWhere('aei.activo = :activo', { activo });
    }

    return queryBuilder.getMany();
  }

  async findByOei(oeiId: number): Promise<Aei[]> {
    return this.aeiRepository.find({
      where: { oeiId, activo: true },
      order: { codigo: 'ASC' },
    });
  }

  async findByOeis(oeiIds: number[]): Promise<Aei[]> {
    if (!oeiIds || oeiIds.length === 0) {
      return [];
    }

    return this.aeiRepository
      .createQueryBuilder('aei')
      .leftJoinAndSelect('aei.oei', 'oei')
      .where('aei.oeiId IN (:...oeiIds)', { oeiIds })
      .andWhere('aei.activo = true')
      .orderBy('aei.codigo', 'ASC')
      .getMany();
  }

  async findOne(id: number): Promise<Aei> {
    const aei = await this.aeiRepository.findOne({
      where: { id },
      relations: ['oei'],
    });

    if (!aei) {
      throw new NotFoundException(`AEI con ID ${id} no encontrada`);
    }

    return aei;
  }

  async update(id: number, updateAeiDto: UpdateAeiDto, userId?: number): Promise<Aei> {
    const aei = await this.findOne(id);

    if (updateAeiDto.codigo && updateAeiDto.codigo !== aei.codigo) {
      const existing = await this.aeiRepository.findOne({
        where: { codigo: updateAeiDto.codigo },
      });
      if (existing) {
        throw new ConflictException(`Ya existe una AEI con el código ${updateAeiDto.codigo}`);
      }
    }

    Object.assign(aei, updateAeiDto, { updatedBy: userId });
    return this.aeiRepository.save(aei);
  }

  async remove(id: number, userId?: number): Promise<Aei> {
    const aei = await this.findOne(id);
    aei.activo = false;
    aei.updatedBy = userId;
    return this.aeiRepository.save(aei);
  }

  async hardDelete(id: number): Promise<void> {
    const aei = await this.findOne(id);
    await this.aeiRepository.remove(aei);
  }
}
