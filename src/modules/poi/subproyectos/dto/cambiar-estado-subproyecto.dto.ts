import { IsEnum } from 'class-validator';
import { ProyectoEstado } from '../../proyectos/enums/proyecto-estado.enum';

export class CambiarEstadoSubproyectoDto {
  @IsEnum(ProyectoEstado, {
    message: 'El nuevo estado debe ser uno de los valores válidos de ProyectoEstado',
  })
  nuevoEstado: ProyectoEstado;
}
