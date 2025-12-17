import { IsEnum, IsOptional, IsString, IsNumber, Min, MaxLength } from 'class-validator';
import { TareaEstado } from '../enums/tarea.enum';

export class CambiarEstadoTareaDto {
  @IsEnum(TareaEstado)
  estado: TareaEstado;

  @IsOptional()
  @IsNumber()
  @Min(0)
  horasReales?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenciaUrl?: string;
}
