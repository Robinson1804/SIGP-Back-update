import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ActaEstado } from '../enums/acta.enum';

export class AprobarActaDto {
  @IsEnum(ActaEstado)
  estado: ActaEstado;

  @IsOptional()
  @IsString()
  observacion?: string;
}
