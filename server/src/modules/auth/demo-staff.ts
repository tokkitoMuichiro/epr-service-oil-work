import type { RoleId } from '../../shared.js'

/** Extra active users for equipment «У сотрудников» demos (dev / SEED_DEMO). */
export interface DemoStaffUser {
  id: string
  login: string
  fullName: string
  role: RoleId
}

export const DEMO_STAFF_USERS: DemoStaffUser[] = [
  { id: 'u-staff-01', login: 'staff.01', fullName: 'Алексеев Павел Игоревич', role: 'master' },
  { id: 'u-staff-02', login: 'staff.02', fullName: 'Борисова Елена Викторовна', role: 'master' },
  { id: 'u-staff-03', login: 'staff.03', fullName: 'Васильев Дмитрий Сергеевич', role: 'master' },
  { id: 'u-staff-04', login: 'staff.04', fullName: 'Громова Ольга Николаевна', role: 'office' },
  { id: 'u-staff-05', login: 'staff.05', fullName: 'Денисов Игорь Александрович', role: 'master' },
  { id: 'u-staff-06', login: 'staff.06', fullName: 'Егорова Мария Павловна', role: 'master' },
  { id: 'u-staff-07', login: 'staff.07', fullName: 'Жуков Андрей Михайлович', role: 'master' },
  { id: 'u-staff-08', login: 'staff.08', fullName: 'Захарова Светлана Юрьевна', role: 'office' },
  { id: 'u-staff-09', login: 'staff.09', fullName: 'Ильин Константин Олегович', role: 'master' },
  { id: 'u-staff-10', login: 'staff.10', fullName: 'Карпова Наталья Ивановна', role: 'master' },
  { id: 'u-staff-11', login: 'staff.11', fullName: 'Лебедев Роман Валерьевич', role: 'master' },
  { id: 'u-staff-12', login: 'staff.12', fullName: 'Миронова Анна Дмитриевна', role: 'office' },
  { id: 'u-staff-13', login: 'staff.13', fullName: 'Новиков Сергей Петрович', role: 'master' },
  { id: 'u-staff-14', login: 'staff.14', fullName: 'Орлова Татьяна Сергеевна', role: 'master' },
  { id: 'u-staff-15', login: 'staff.15', fullName: 'Павлов Евгений Николаевич', role: 'master' },
  { id: 'u-staff-16', login: 'staff.16', fullName: 'Романова Ирина Алексеевна', role: 'office' },
  { id: 'u-staff-17', login: 'staff.17', fullName: 'Соколов Максим Андреевич', role: 'master' },
  { id: 'u-staff-18', login: 'staff.18', fullName: 'Тимофеев Артём Ильич', role: 'master' },
  { id: 'u-staff-19', login: 'staff.19', fullName: 'Устинова Юлия Владимировна', role: 'master' },
  { id: 'u-staff-20', login: 'staff.20', fullName: 'Фролов Никита Романович', role: 'master' },
  { id: 'u-staff-21', login: 'staff.21', fullName: 'Харитонов Олег Васильевич', role: 'office' },
  { id: 'u-staff-22', login: 'staff.22', fullName: 'Цветкова Дарья Олеговна', role: 'master' },
  { id: 'u-staff-23', login: 'staff.23', fullName: 'Чернов Виктор Геннадьевич', role: 'master' },
  { id: 'u-staff-24', login: 'staff.24', fullName: 'Шестакова Полина Игоревна', role: 'office' },
  { id: 'u-staff-25', login: 'staff.25', fullName: 'Яковлев Станислав Петрович', role: 'master' },
]
