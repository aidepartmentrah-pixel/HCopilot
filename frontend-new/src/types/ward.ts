export interface Ward {
  ward_id: number
  ward_name: string
  department_id: number
  assigned_beds: number
}

export interface WardListResponse {
  wards: Ward[]
  total: number
  assigned_beds: number
  departments: number
}

export interface WardCreateInput {
  ward_name: string
  department_id: number
}
