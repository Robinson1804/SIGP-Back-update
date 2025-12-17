import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateRequerimientoDto } from './create-requerimiento.dto';

export class UpdateRequerimientoDto extends PartialType(
  OmitType(CreateRequerimientoDto, ['proyectoId', 'codigo'] as const),
) {}
