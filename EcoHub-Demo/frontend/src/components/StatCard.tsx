import { LucideIcon } from 'lucide-react';

const iconMap: Record<string, string> = {
  emerald: 'text-emerald-500 bg-emerald-100',
  blue: 'text-blue-500 bg-blue-100',
  rose: 'text-rose-500 bg-rose-100',
  purple: 'text-purple-500 bg-purple-100',
  amber: 'text-amber-500 bg-amber-100',
  green: 'text-green-500 bg-green-100',
  indigo: 'text-indigo-500 bg-indigo-100',
  cyan: 'text-cyan-500 bg-cyan-100',
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color?: keyof typeof iconMap;
  trend?: string;
}

export default function StatCard({ title, value, icon: Icon, color = 'emerald', trend }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {trend && (
            <p className={`mt-1 text-sm font-medium ${trend.includes('+') ? 'text-green-600' : 'text-gray-500'}`}>
              {trend}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${iconMap[color] || iconMap.emerald}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}
