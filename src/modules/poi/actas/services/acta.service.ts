import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Acta } from '../entities/acta.entity';
import { CreateActaReunionDto } from '../dto/create-acta-reunion.dto';
import { CreateActaConstitucionDto } from '../dto/create-acta-constitucion.dto';
import { CreateActaDailyDto } from '../dto/create-acta-daily.dto';
import { AprobarActaDto } from '../dto/aprobar-acta.dto';
import { ActaTipo, ActaEstado } from '../enums/acta.enum';

@Injectable()
export class ActaService {
  constructor(
    @InjectRepository(Acta)
    private readonly actaRepository: Repository<Acta>,
  ) {}

  async createReunion(createDto: CreateActaReunionDto, userId?: number): Promise<Acta> {
    const existing = await this.actaRepository.findOne({
      where: { proyectoId: createDto.proyectoId, codigo: createDto.codigo },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un acta con el código ${createDto.codigo} en este proyecto`,
      );
    }

    const acta = this.actaRepository.create({
      ...createDto,
      tipo: ActaTipo.REUNION,
      estado: ActaEstado.BORRADOR,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.actaRepository.save(acta);
  }

  async createConstitucion(createDto: CreateActaConstitucionDto, userId?: number): Promise<Acta> {
    // Verificar si ya existe un acta de constitución para este proyecto
    const existingConstitucion = await this.actaRepository.findOne({
      where: { proyectoId: createDto.proyectoId, tipo: ActaTipo.CONSTITUCION, activo: true },
    });

    if (existingConstitucion) {
      throw new ConflictException(
        `Ya existe un Acta de Constitución para este proyecto`,
      );
    }

    // Auto-generar codigo si no se proporciona
    const codigo = createDto.codigo || `AC-PROY${createDto.proyectoId}`;

    // Verificar que el codigo no exista
    const existing = await this.actaRepository.findOne({
      where: { proyectoId: createDto.proyectoId, codigo },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un acta con el código ${codigo} en este proyecto`,
      );
    }

    // Generar valores por defecto
    const today = new Date().toISOString().split('T')[0];

    const acta = this.actaRepository.create({
      ...createDto,
      codigo,
      nombre: createDto.nombre || 'Acta de Constitución',
      fecha: createDto.fecha || today,
      tipo: ActaTipo.CONSTITUCION,
      estado: ActaEstado.BORRADOR,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.actaRepository.save(acta);
  }

  async createDaily(createDto: CreateActaDailyDto, userId?: number): Promise<Acta> {
    // Generar código único para el Daily Meeting
    const today = new Date(createDto.fecha);
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const codigo = `DM-${createDto.proyectoId}-${dateStr}`;

    // Verificar si ya existe un daily con el mismo código
    const existing = await this.actaRepository.findOne({
      where: { proyectoId: createDto.proyectoId, codigo },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un Acta de Daily Meeting para esta fecha en este proyecto`,
      );
    }

    const acta = this.actaRepository.create({
      proyectoId: createDto.proyectoId,
      codigo,
      nombre: createDto.nombre,
      fecha: createDto.fecha,
      horaInicio: createDto.horaInicio,
      horaFin: createDto.horaFin,
      sprintId: createDto.sprintId,
      sprintNombre: createDto.sprintNombre,
      duracionMinutos: createDto.duracionMinutos,
      participantesDaily: createDto.participantesDaily,
      impedimentosGenerales: createDto.impedimentosGenerales,
      notasAdicionales: createDto.notasAdicionales,
      observaciones: createDto.observaciones,
      tipo: ActaTipo.DAILY_MEETING,
      estado: ActaEstado.BORRADOR,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.actaRepository.save(acta);
  }

  async updateDaily(id: number, updateDto: Partial<CreateActaDailyDto>, userId: number): Promise<Acta> {
    const acta = await this.findOne(id);

    if (acta.tipo !== ActaTipo.DAILY_MEETING) {
      throw new BadRequestException('Esta acta no es de tipo Daily Meeting');
    }

    if (acta.estado === ActaEstado.APROBADO) {
      throw new BadRequestException('No se puede editar un acta aprobada');
    }

    // Update only the provided fields
    if (updateDto.nombre !== undefined) acta.nombre = updateDto.nombre;
    if (updateDto.fecha !== undefined) acta.fecha = updateDto.fecha as unknown as Date;
    if (updateDto.horaInicio !== undefined) acta.horaInicio = updateDto.horaInicio;
    if (updateDto.horaFin !== undefined) acta.horaFin = updateDto.horaFin;
    if (updateDto.sprintId !== undefined) acta.sprintId = updateDto.sprintId;
    if (updateDto.sprintNombre !== undefined) acta.sprintNombre = updateDto.sprintNombre;
    if (updateDto.duracionMinutos !== undefined) acta.duracionMinutos = updateDto.duracionMinutos;
    if (updateDto.participantesDaily !== undefined) acta.participantesDaily = updateDto.participantesDaily;
    if (updateDto.impedimentosGenerales !== undefined) acta.impedimentosGenerales = updateDto.impedimentosGenerales;
    if (updateDto.notasAdicionales !== undefined) acta.notasAdicionales = updateDto.notasAdicionales;
    if (updateDto.observaciones !== undefined) acta.observaciones = updateDto.observaciones;

    acta.updatedBy = userId;

    return this.actaRepository.save(acta);
  }

  async updateReunion(id: number, updateDto: Partial<CreateActaReunionDto>, userId: number): Promise<Acta> {
    const acta = await this.findOne(id);

    if (acta.tipo !== ActaTipo.REUNION) {
      throw new BadRequestException('Esta acta no es de tipo Reunión');
    }

    if (acta.estado === ActaEstado.APROBADO) {
      throw new BadRequestException('No se puede editar un acta aprobada');
    }

    Object.assign(acta, updateDto);
    acta.updatedBy = userId;

    return this.actaRepository.save(acta);
  }

  async updateConstitucion(id: number, updateDto: Partial<CreateActaConstitucionDto>, userId: number): Promise<Acta> {
    const acta = await this.findOne(id);

    if (acta.tipo !== ActaTipo.CONSTITUCION) {
      throw new BadRequestException('Esta acta no es de tipo Constitución');
    }

    if (acta.estado === ActaEstado.APROBADO) {
      throw new BadRequestException('No se puede editar un acta aprobada');
    }

    Object.assign(acta, updateDto);
    acta.updatedBy = userId;

    return this.actaRepository.save(acta);
  }

  async findAll(filters?: {
    proyectoId?: number;
    tipo?: ActaTipo;
    estado?: ActaEstado;
    activo?: boolean;
  }): Promise<Acta[]> {
    const queryBuilder = this.actaRepository
      .createQueryBuilder('acta')
      .orderBy('acta.fecha', 'DESC');

    if (filters?.proyectoId) {
      queryBuilder.andWhere('acta.proyectoId = :proyectoId', { proyectoId: filters.proyectoId });
    }

    if (filters?.tipo) {
      queryBuilder.andWhere('acta.tipo = :tipo', { tipo: filters.tipo });
    }

    if (filters?.estado) {
      queryBuilder.andWhere('acta.estado = :estado', { estado: filters.estado });
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('acta.activo = :activo', { activo: filters.activo });
    }

    return queryBuilder.getMany();
  }

  async findByProyecto(proyectoId: number): Promise<{ constitucion: Acta | null; reuniones: Acta[]; dailies: Acta[] }> {
    const actas = await this.actaRepository.find({
      where: { proyectoId, activo: true },
      order: { fecha: 'DESC' },
    });

    const constitucion = actas.find((a) => a.tipo === ActaTipo.CONSTITUCION) || null;
    const reuniones = actas.filter((a) => a.tipo === ActaTipo.REUNION);
    const dailies = actas.filter((a) => a.tipo === ActaTipo.DAILY_MEETING);

    return { constitucion, reuniones, dailies };
  }

  async findOne(id: number): Promise<Acta> {
    const acta = await this.actaRepository.findOne({
      where: { id },
      relations: ['proyecto', 'aprobador', 'moderador'],
    });

    if (!acta) {
      throw new NotFoundException(`Acta con ID ${id} no encontrada`);
    }

    return acta;
  }

  async findOneWithProyecto(id: number): Promise<{ acta: Acta; proyecto: { codigo: string; nombre: string } }> {
    const acta = await this.actaRepository.findOne({
      where: { id },
      relations: ['proyecto'],
    });

    if (!acta) {
      throw new NotFoundException(`Acta con ID ${id} no encontrada`);
    }

    return {
      acta,
      proyecto: {
        codigo: acta.proyecto?.codigo || 'N/A',
        nombre: acta.proyecto?.nombre || 'Sin nombre',
      },
    };
  }

  async subirDocumentoFirmado(id: number, documentoUrl: string, userId: number): Promise<Acta> {
    const acta = await this.findOne(id);

    if (acta.estado === ActaEstado.APROBADO) {
      throw new BadRequestException('El acta ya está aprobada');
    }

    acta.documentoFirmadoUrl = documentoUrl;
    acta.documentoFirmadoFecha = new Date();
    acta.estado = ActaEstado.PENDIENTE;
    acta.updatedBy = userId;

    return this.actaRepository.save(acta);
  }

  async aprobar(id: number, aprobarDto: AprobarActaDto, userId: number): Promise<Acta> {
    const acta = await this.findOne(id);

    if (acta.estado === ActaEstado.APROBADO) {
      throw new BadRequestException('El acta ya está aprobada');
    }

    if (aprobarDto.aprobado) {
      acta.estado = ActaEstado.APROBADO;
      acta.aprobadoPor = userId;
      acta.fechaAprobacion = new Date();
    } else {
      acta.estado = ActaEstado.RECHAZADO;
      acta.comentarioRechazo = aprobarDto.comentario || null;
    }

    acta.updatedBy = userId;

    return this.actaRepository.save(acta);
  }

  async remove(id: number, userId?: number): Promise<Acta> {
    const acta = await this.findOne(id);
    acta.activo = false;
    acta.updatedBy = userId;
    return this.actaRepository.save(acta);
  }
}
