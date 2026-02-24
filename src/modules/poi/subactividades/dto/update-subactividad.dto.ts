import { PartialType, OmitType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { CreateSubactividadDto } from './create-subactividad.dto';
import { ActividadEstado } from '../../actividades/enums/actividad-estado.enum';

export class UpdateSubactividadDto extends PartialType(
  OmitType(CreateSubactividadDto, ['actividadPadreId'] as const),
) {
  @IsOptional()
  @IsEnum(ActividadEstado)
  estado?: ActividadEstado;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
