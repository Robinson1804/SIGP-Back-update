import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RequerimientoEstado } from '../enums/requerimiento.enum';

export class AprobarRequerimientoDto {
  @IsEnum(RequerimientoEstado)
  estado: RequerimientoEstado;

  @IsOptional()
  @IsString()
  observacion?: string;
}
