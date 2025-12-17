import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../entities/usuario.entity';
import { Role } from '../../../common/constants/roles.constant';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
  ) {}

  /**
   * Obtener todos los usuarios activos
   */
  async findAll(filters?: {
    rol?: Role;
    activo?: boolean;
    busqueda?: string;
  }): Promise<Usuario[]> {
    const queryBuilder = this.usuarioRepository
      .createQueryBuilder('usuario')
      .select([
        'usuario.id',
        'usuario.email',
        'usuario.username',
        'usuario.nombre',
        'usuario.apellido',
        'usuario.rol',
        'usuario.avatarUrl',
        'usuario.telefono',
        'usuario.activo',
      ])
      .orderBy('usuario.apellido', 'ASC')
      .addOrderBy('usuario.nombre', 'ASC');

    if (filters?.rol) {
      queryBuilder.andWhere('usuario.rol = :rol', { rol: filters.rol });
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('usuario.activo = :activo', { activo: filters.activo });
    } else {
      // Por defecto, solo usuarios activos
      queryBuilder.andWhere('usuario.activo = :activo', { activo: true });
    }

    if (filters?.busqueda) {
      queryBuilder.andWhere(
        '(LOWER(usuario.nombre) LIKE LOWER(:busqueda) OR LOWER(usuario.apellido) LIKE LOWER(:busqueda) OR LOWER(usuario.email) LIKE LOWER(:busqueda))',
        { busqueda: `%${filters.busqueda}%` },
      );
    }

    return queryBuilder.getMany();
  }

  /**
   * Obtener usuarios por rol
   */
  async findByRol(rol: Role): Promise<Usuario[]> {
    return this.findAll({ rol, activo: true });
  }

  /**
   * Obtener usuarios por múltiples roles
   */
  async findByRoles(roles: Role[]): Promise<Usuario[]> {
    const queryBuilder = this.usuarioRepository
      .createQueryBuilder('usuario')
      .select([
        'usuario.id',
        'usuario.email',
        'usuario.username',
        'usuario.nombre',
        'usuario.apellido',
        'usuario.rol',
        'usuario.avatarUrl',
        'usuario.telefono',
        'usuario.activo',
      ])
      .where('usuario.rol IN (:...roles)', { roles })
      .andWhere('usuario.activo = :activo', { activo: true })
      .orderBy('usuario.apellido', 'ASC')
      .addOrderBy('usuario.nombre', 'ASC');

    return queryBuilder.getMany();
  }

  /**
   * Obtener un usuario por ID
   */
  async findOne(id: number): Promise<Usuario> {
    const usuario = await this.usuarioRepository.findOne({
      where: { id },
      select: [
        'id',
        'email',
        'username',
        'nombre',
        'apellido',
        'rol',
        'avatarUrl',
        'telefono',
        'activo',
      ],
    });

    if (!usuario) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    return usuario;
  }

  /**
   * Obtener todos los roles disponibles
   */
  getRoles(): string[] {
    return Object.values(Role);
  }
}
