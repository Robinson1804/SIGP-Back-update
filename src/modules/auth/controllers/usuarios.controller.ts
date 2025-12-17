import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { UsuariosService } from '../services/usuarios.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Role } from '../../../common/constants/roles.constant';

@Controller('usuarios')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  /**
   * GET /usuarios
   * Obtener lista de usuarios con filtros opcionales
   */
  @Get()
  findAll(
    @Query('rol') rol?: Role,
    @Query('activo') activo?: string,
    @Query('busqueda') busqueda?: string,
  ) {
    return this.usuariosService.findAll({
      rol,
      activo: activo !== undefined ? activo === 'true' : undefined,
      busqueda,
    });
  }

  /**
   * GET /usuarios/roles
   * Obtener lista de roles disponibles
   */
  @Get('roles')
  getRoles() {
    return this.usuariosService.getRoles();
  }

  /**
   * GET /usuarios/by-rol/:rol
   * Obtener usuarios por un rol específico
   */
  @Get('by-rol/:rol')
  findByRol(@Param('rol') rol: Role) {
    return this.usuariosService.findByRol(rol);
  }

  /**
   * GET /usuarios/coordinadores
   * Obtener todos los coordinadores
   */
  @Get('coordinadores')
  getCoordinadores() {
    return this.usuariosService.findByRol(Role.COORDINADOR);
  }

  /**
   * GET /usuarios/scrum-masters
   * Obtener todos los scrum masters
   */
  @Get('scrum-masters')
  getScrumMasters() {
    return this.usuariosService.findByRol(Role.SCRUM_MASTER);
  }

  /**
   * GET /usuarios/patrocinadores
   * Obtener todos los patrocinadores
   */
  @Get('patrocinadores')
  getPatrocinadores() {
    return this.usuariosService.findByRol(Role.PATROCINADOR);
  }

  /**
   * GET /usuarios/desarrolladores
   * Obtener todos los desarrolladores
   */
  @Get('desarrolladores')
  getDesarrolladores() {
    return this.usuariosService.findByRol(Role.DESARROLLADOR);
  }

  /**
   * GET /usuarios/implementadores
   * Obtener todos los implementadores
   */
  @Get('implementadores')
  getImplementadores() {
    return this.usuariosService.findByRol(Role.IMPLEMENTADOR);
  }

  /**
   * GET /usuarios/responsables
   * Obtener todos los usuarios que pueden ser responsables
   * (Scrum Masters, Desarrolladores, Implementadores)
   */
  @Get('responsables')
  getResponsables() {
    return this.usuariosService.findByRoles([
      Role.SCRUM_MASTER,
      Role.DESARROLLADOR,
      Role.IMPLEMENTADOR,
    ]);
  }

  /**
   * GET /usuarios/:id
   * Obtener un usuario por ID
   */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosService.findOne(id);
  }
}
