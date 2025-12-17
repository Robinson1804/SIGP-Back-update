import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { DailyMeeting } from '../entities/daily-meeting.entity';
import { DailyParticipante } from '../entities/daily-participante.entity';
import { CreateDailyMeetingDto, CreateParticipanteDto } from '../dto/create-daily-meeting.dto';
import { UpdateDailyMeetingDto } from '../dto/update-daily-meeting.dto';
import { UpdateParticipanteDto } from '../dto/update-participante.dto';
import { DailyMeetingTipo } from '../enums/daily-meeting.enum';

@Injectable()
export class DailyMeetingService {
  constructor(
    @InjectRepository(DailyMeeting)
    private readonly dailyMeetingRepository: Repository<DailyMeeting>,
    @InjectRepository(DailyParticipante)
    private readonly participanteRepository: Repository<DailyParticipante>,
  ) {}

  async create(createDto: CreateDailyMeetingDto, userId?: number): Promise<DailyMeeting> {
    // Validate that proyectoId or actividadId is provided based on tipo
    if (createDto.tipo === DailyMeetingTipo.PROYECTO && !createDto.proyectoId) {
      throw new BadRequestException('proyectoId es requerido para dailies de tipo Proyecto');
    }
    if (createDto.tipo === DailyMeetingTipo.ACTIVIDAD && !createDto.actividadId) {
      throw new BadRequestException('actividadId es requerido para dailies de tipo Actividad');
    }

    const { participantes, ...dailyData } = createDto;

    const daily = this.dailyMeetingRepository.create({
      ...dailyData,
      createdBy: userId,
      updatedBy: userId,
    });

    const savedDaily = await this.dailyMeetingRepository.save(daily);

    // Create participantes if provided
    if (participantes && participantes.length > 0) {
      const participantesEntities = participantes.map((p) =>
        this.participanteRepository.create({
          ...p,
          dailyMeetingId: savedDaily.id,
        }),
      );
      await this.participanteRepository.save(participantesEntities);
    }

    return this.findOne(savedDaily.id);
  }

  async findAll(filters?: {
    tipo?: DailyMeetingTipo;
    proyectoId?: number;
    actividadId?: number;
    sprintId?: number;
    fechaDesde?: string;
    fechaHasta?: string;
  }): Promise<DailyMeeting[]> {
    const queryBuilder = this.dailyMeetingRepository
      .createQueryBuilder('daily')
      .leftJoinAndSelect('daily.facilitador', 'facilitador')
      .leftJoinAndSelect('daily.participantes', 'participantes')
      .leftJoinAndSelect('participantes.usuario', 'usuario')
      .where('daily.activo = :activo', { activo: true })
      .orderBy('daily.fecha', 'DESC')
      .addOrderBy('daily.horaInicio', 'DESC');

    if (filters?.tipo) {
      queryBuilder.andWhere('daily.tipo = :tipo', { tipo: filters.tipo });
    }

    if (filters?.proyectoId) {
      queryBuilder.andWhere('daily.proyectoId = :proyectoId', {
        proyectoId: filters.proyectoId,
      });
    }

    if (filters?.actividadId) {
      queryBuilder.andWhere('daily.actividadId = :actividadId', {
        actividadId: filters.actividadId,
      });
    }

    if (filters?.sprintId) {
      queryBuilder.andWhere('daily.sprintId = :sprintId', {
        sprintId: filters.sprintId,
      });
    }

    if (filters?.fechaDesde && filters?.fechaHasta) {
      queryBuilder.andWhere('daily.fecha BETWEEN :fechaDesde AND :fechaHasta', {
        fechaDesde: filters.fechaDesde,
        fechaHasta: filters.fechaHasta,
      });
    }

    return queryBuilder.getMany();
  }

  async findByProyecto(proyectoId: number): Promise<DailyMeeting[]> {
    return this.dailyMeetingRepository.find({
      where: { proyectoId, activo: true },
      relations: ['facilitador', 'participantes', 'participantes.usuario'],
      order: { fecha: 'DESC', horaInicio: 'DESC' },
    });
  }

  async findByActividad(actividadId: number): Promise<DailyMeeting[]> {
    return this.dailyMeetingRepository.find({
      where: { actividadId, activo: true },
      relations: ['facilitador', 'participantes', 'participantes.usuario'],
      order: { fecha: 'DESC', horaInicio: 'DESC' },
    });
  }

  async findBySprint(sprintId: number): Promise<DailyMeeting[]> {
    return this.dailyMeetingRepository.find({
      where: { sprintId, activo: true },
      relations: ['facilitador', 'participantes', 'participantes.usuario'],
      order: { fecha: 'DESC', horaInicio: 'DESC' },
    });
  }

  async findOne(id: number): Promise<DailyMeeting> {
    const daily = await this.dailyMeetingRepository.findOne({
      where: { id, activo: true },
      relations: ['facilitador', 'participantes', 'participantes.usuario'],
    });

    if (!daily) {
      throw new NotFoundException(`Daily Meeting con ID ${id} no encontrado`);
    }

    return daily;
  }

  async update(id: number, updateDto: UpdateDailyMeetingDto, userId?: number): Promise<DailyMeeting> {
    const daily = await this.findOne(id);

    Object.assign(daily, updateDto, { updatedBy: userId });

    return this.dailyMeetingRepository.save(daily);
  }

  async addParticipante(
    dailyMeetingId: number,
    createDto: CreateParticipanteDto,
  ): Promise<DailyParticipante> {
    const daily = await this.findOne(dailyMeetingId);

    // Check if participant already exists
    const existing = await this.participanteRepository.findOne({
      where: { dailyMeetingId, usuarioId: createDto.usuarioId },
    });

    if (existing) {
      throw new ConflictException('El participante ya está registrado en este daily');
    }

    const participante = this.participanteRepository.create({
      ...createDto,
      dailyMeetingId,
    });

    return this.participanteRepository.save(participante);
  }

  async updateParticipante(
    participanteId: number,
    updateDto: UpdateParticipanteDto,
  ): Promise<DailyParticipante> {
    const participante = await this.participanteRepository.findOne({
      where: { id: participanteId },
    });

    if (!participante) {
      throw new NotFoundException(`Participante con ID ${participanteId} no encontrado`);
    }

    Object.assign(participante, updateDto);

    return this.participanteRepository.save(participante);
  }

  async removeParticipante(participanteId: number): Promise<void> {
    const participante = await this.participanteRepository.findOne({
      where: { id: participanteId },
    });

    if (!participante) {
      throw new NotFoundException(`Participante con ID ${participanteId} no encontrado`);
    }

    await this.participanteRepository.remove(participante);
  }

  async getResumen(id: number): Promise<{
    totalParticipantes: number;
    asistieron: number;
    noAsistieron: number;
    conImpedimentos: number;
    impedimentos: string[];
  }> {
    const daily = await this.findOne(id);

    const participantes = daily.participantes || [];
    const asistieron = participantes.filter((p) => p.asistio).length;
    const conImpedimentos = participantes.filter((p) => p.impedimentos).length;
    const impedimentos = participantes
      .filter((p) => p.impedimentos)
      .map((p) => p.impedimentos);

    return {
      totalParticipantes: participantes.length,
      asistieron,
      noAsistieron: participantes.length - asistieron,
      conImpedimentos,
      impedimentos,
    };
  }

  async remove(id: number, userId?: number): Promise<DailyMeeting> {
    const daily = await this.findOne(id);
    daily.activo = false;
    daily.updatedBy = userId ?? null;
    return this.dailyMeetingRepository.save(daily);
  }
}
