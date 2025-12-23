import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSprintDto {
  @IsInt()
  proyectoId: number;

  @IsString()
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @IsString()
  objetivo?: string;

  @IsOptional()
  @IsString()
  sprintGoal?: string;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  velocidadPlanificada?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  capacidadEquipo?: number;
}
