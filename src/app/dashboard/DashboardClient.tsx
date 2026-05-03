'use client'

import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { KPICard } from '@/components/dashboard/KPICard'
import {
  ChartContainer,
  PipelineFunnel,
  LeadVolumeChart,
  SourceAttribution,
  ScoreDistribution,
  LeadAging,
} from '@/components/charts'
import { SkeletonKPI } from '@/components/ui'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useTenantId } from '@/lib/hooks/useTenant'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function DashboardClient() {
  const TENANT = useTenantId()
  const router = useRouter()
  const { timeRange, setTimeRange } = useDashboardStore()

  const { data: kpisData, isLoading: kpisLoading, error: kpisError } =
    useSWR(`/api/dashboard/kpis?tenant_id=${TENANT}`, fetcher)

  const { data: pipelineData, isLoading: pipelineLoading, error: pipelineError } =
    useSWR(`/api/dashboard/pipeline?tenant_id=${TENANT}`, fetcher)

  const { data: volumeData, isLoading: volumeLoading, error: volumeError } =
    useSWR(`/api/dashboard/volume?tenant_id=${TENANT}&range=${timeRange}`, fetcher)

  const { data: sourcesData, isLoading: sourcesLoading, error: sourcesError } =
    useSWR(`/api/dashboard/sources?tenant_id=${TENANT}`, fetcher)

  const { data: scoresData, isLoading: scoresLoading, error: scoresError } =
    useSWR(`/api/dashboard/scores?tenant_id=${TENANT}`, fetcher)

  const { data: agingData, isLoading: agingLoading, error: agingError } =
    useSWR(`/api/dashboard/aging?tenant_id=${TENANT}`, fetcher)

  const kpiCards = kpisData
    ? [
        {
          title: 'Total Active Leads',
          value: kpisData.total_active as number,
          unit: 'leads',
          trend: kpisData.total_active_trend as number,
          trendLabel: 'vs last 30d',
          format: 'number' as const,
          sparklineData: kpisData.sparklines?.active as number[],
        },
        {
          title: 'Lead Velocity',
          value: kpisData.velocity_per_week as number,
          unit: '/wk',
          trend: kpisData.velocity_trend as number,
          trendLabel: 'vs last 7d',
          format: 'number' as const,
          sparklineData: kpisData.sparklines?.velocity as number[],
        },
        {
          title: 'Avg Lead Score',
          value: kpisData.avg_score as number,
          trend: kpisData.avg_score_trend as number,
          trendLabel: 'vs last 30d',
          format: 'number' as const,
          sparklineData: kpisData.sparklines?.score as number[],
        },
        {
          title: 'Conversion Rate',
          value: kpisData.conversion_rate as number,
          unit: '%',
          trend: kpisData.conversion_trend as number,
          trendLabel: 'vs last 30d',
          format: 'percent' as const,
          sparklineData: kpisData.sparklines?.conversion as number[],
        },
      ]
    : null

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Row */}
      <section aria-label="Key metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {kpisLoading || kpisError || !kpiCards
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)
            : kpiCards.map((kpi) => <KPICard key={kpi.title} {...kpi} />)}
        </div>
      </section>

      {/* Chart Row 1: Pipeline + Lead Volume */}
      <section aria-label="Pipeline and volume" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
        <div className="col-span-1 lg:col-span-2">
          <ChartContainer
            title="Pipeline"
            isLoading={pipelineLoading || !pipelineData}
            error={pipelineError ? 'Failed to load pipeline data' : null}
            isEmpty={!pipelineLoading && !pipelineError && pipelineData && !pipelineData?.stages?.length}
          >
            <PipelineFunnel
              stages={pipelineData?.stages}
              onStageClick={(id) => router.push(`/dashboard/leads?stage_id=${id}`)}
            />
          </ChartContainer>
        </div>

        <div className="col-span-1 lg:col-span-3">
          <ChartContainer
            title="Lead Volume"
            timeRangeSelector
            onTimeRangeChange={setTimeRange}
            isLoading={volumeLoading || !volumeData}
            error={volumeError ? 'Failed to load volume data' : null}
            isEmpty={!volumeLoading && !volumeError && volumeData && !volumeData?.data?.length}
          >
            <LeadVolumeChart data={volumeData?.data ?? []} timeRange={timeRange} />
          </ChartContainer>
        </div>
      </section>

      {/* Chart Row 2: Source Attribution + Score Distribution + Lead Aging */}
      <section aria-label="Analytics breakdowns" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ChartContainer
          title="Source Attribution"
          isLoading={sourcesLoading || !sourcesData}
          error={sourcesError ? 'Failed to load source data' : null}
          isEmpty={!sourcesLoading && !sourcesError && sourcesData && !sourcesData?.data?.length}
        >
          <SourceAttribution data={sourcesData?.data ?? []} />
        </ChartContainer>

        <ChartContainer
          title="Score Distribution"
          isLoading={scoresLoading || !scoresData}
          error={scoresError ? 'Failed to load score data' : null}
          isEmpty={!scoresLoading && !scoresError && scoresData && !scoresData?.leads?.length}
        >
          <ScoreDistribution
            leads={scoresData?.leads ?? []}
            avgScore={scoresData?.avg_score ?? 0}
          />
        </ChartContainer>

        <ChartContainer
          title="Lead Aging"
          isLoading={agingLoading || !agingData}
          error={agingError ? 'Failed to load aging data' : null}
          isEmpty={!agingLoading && !agingError && agingData && !agingData?.data?.length}
        >
          <LeadAging data={agingData?.data ?? []} />
        </ChartContainer>
      </section>
    </div>
  )
}
