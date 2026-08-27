export type MonitorStatus = string;

export interface Monitor {
  id: number;
  name: string;
  url: string;
  status: MonitorStatus;
  expected_status: number;
  is_active: boolean;
  ssl_enabled: boolean;
}
