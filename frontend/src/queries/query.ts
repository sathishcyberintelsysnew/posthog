import { DataNode, EventsQuery, PersonsNode } from './schema'
import {
    isInsightQueryNode,
    isEventsQuery,
    isLegacyQuery,
    isPersonsNode,
    isTimeToSeeDataSessionsQuery,
    isTimeToSeeDataQuery,
    isRecentPerformancePageViewNode,
    isDataTableNode,
    isTimeToSeeDataSessionsNode,
    isHogQLQuery,
    isInsightVizNode,
} from './utils'
import api, { ApiMethodOptions } from 'lib/api'
import { getCurrentTeamId } from 'lib/utils/logics'
import { AnyPartialFilterType, OnlineExportContext } from '~/types'
import {
    filterTrendsClientSideParams,
    isFunnelsFilter,
    isLifecycleFilter,
    isPathsFilter,
    isRetentionFilter,
    isStickinessFilter,
    isTrendsFilter,
} from 'scenes/insights/sharedUtils'
import { toParams } from 'lib/utils'
import { queryNodeToFilter } from './nodes/InsightQuery/utils/queryNodeToFilter'
import { now } from 'lib/dayjs'
import { currentSessionId } from 'lib/internalMetrics'

const EVENTS_DAYS_FIRST_FETCH = 5

export const DEFAULT_QUERY_LIMIT = 100

//get export context for a given query
export function queryExportContext<N extends DataNode = DataNode>(
    query: N,
    methodOptions?: ApiMethodOptions,
    refresh?: boolean
): OnlineExportContext {
    if (isEventsQuery(query)) {
        return {
            path: api.queryURL(),
            method: 'POST',
            body: {
                ...query,
                after: now().subtract(EVENTS_DAYS_FIRST_FETCH, 'day').toISOString(),
            },
        }
    } else if (isHogQLQuery(query)) {
        return { path: api.queryURL(), method: 'POST', body: query }
    } else if (isPersonsNode(query)) {
        return { path: getPersonsEndpoint(query) }
    } else if (isInsightQueryNode(query)) {
        return legacyInsightQueryExportContext({
            filters: queryNodeToFilter(query),
            currentTeamId: getCurrentTeamId(),
            refresh,
        })
    } else if (isInsightVizNode(query)) {
        return queryExportContext(query.source, methodOptions, refresh)
    } else if (isLegacyQuery(query)) {
        return legacyInsightQueryExportContext({
            filters: query.filters,
            currentTeamId: getCurrentTeamId(),
            methodOptions,
        })
    } else if (isTimeToSeeDataSessionsQuery(query)) {
        return {
            path: '/api/time_to_see_data/sessions',
            method: 'POST',
            body: {
                team_id: query.teamId ?? getCurrentTeamId(),
            },
        }
    } else if (isTimeToSeeDataQuery(query)) {
        return {
            path: '/api/time_to_see_data/session_events',
            method: 'POST',
            body: {
                team_id: query.teamId ?? getCurrentTeamId(),
                session_id: query.sessionId ?? currentSessionId(),
                session_start: query.sessionStart ?? now().subtract(1, 'day').toISOString(),
                session_end: query.sessionEnd ?? now().toISOString(),
            },
        }
    } else if (isTimeToSeeDataSessionsNode(query)) {
        return {
            path: '/api/time_to_see_data/session_events',
            method: 'POST',
            body: {
                team_id: query.source.teamId ?? getCurrentTeamId(),
                session_id: query.source.sessionId ?? currentSessionId(),
                session_start: query.source.sessionStart ?? now().subtract(1, 'day').toISOString(),
                session_end: query.source.sessionEnd ?? now().toISOString(),
            },
        }
    } else if (isRecentPerformancePageViewNode(query)) {
        return { path: api.performanceEvents.recentPageViewsURL() }
    } else if (isDataTableNode(query)) {
        return queryExportContext(query.source, methodOptions, refresh)
    }
    throw new Error(`Unsupported query: ${query.kind}`)
}

// Return data for a given query
export async function query<N extends DataNode = DataNode>(
    queryNode: N,
    methodOptions?: ApiMethodOptions,
    refresh?: boolean,
    queryId?: string
): Promise<N['response']> {
    if (isEventsQuery(queryNode)) {
        return await api.query(queryNode, methodOptions, queryId)
    } else if (isHogQLQuery(queryNode)) {
        return api.query(queryNode, methodOptions, queryId)
    } else if (isPersonsNode(queryNode)) {
        return await api.get(getPersonsEndpoint(queryNode), methodOptions)
    } else if (isInsightQueryNode(queryNode)) {
        const filters = queryNodeToFilter(queryNode)
        const params = {
            ...filters,
            ...(refresh ? { refresh: true } : {}),
            client_query_id: queryId,
            session_id: currentSessionId(),
        }
        const [response] = await legacyInsightQuery({
            filters: params,
            currentTeamId: getCurrentTeamId(),
            methodOptions,
            refresh,
        })
        return await response.json()
    } else if (isLegacyQuery(queryNode)) {
        const [response] = await legacyInsightQuery({
            filters: queryNode.filters,
            currentTeamId: getCurrentTeamId(),
            methodOptions,
        })
        return await response.json()
    } else if (isTimeToSeeDataSessionsQuery(queryNode)) {
        return await api.query(queryNode, methodOptions)
    } else if (isTimeToSeeDataQuery(queryNode)) {
        return await api.query(
            {
                ...queryNode,
                teamId: queryNode.teamId ?? getCurrentTeamId(),
                sessionId: queryNode.sessionId ?? currentSessionId(),
                sessionStart: queryNode.sessionStart ?? now().subtract(1, 'day').toISOString(),
                sessionEnd: queryNode.sessionEnd ?? now().toISOString(),
            },
            methodOptions
        )
    } else if (isTimeToSeeDataSessionsNode(queryNode)) {
        return query(queryNode.source)
    } else if (isRecentPerformancePageViewNode(queryNode)) {
        return await api.query(queryNode, methodOptions)
    }
    throw new Error(`Unsupported query: ${queryNode.kind}`)
}

export function getEventsEndpoint(query: EventsQuery): string {
    return api.events.determineListEndpoint(
        {
            properties: [...(query.fixedProperties || []), ...(query.properties || [])],
            ...(query.event ? { event: query.event } : {}),
            ...(isEventsQuery(query) ? { select: query.select ?? [] } : {}),
            ...(isEventsQuery(query) ? { where: query.where ?? [] } : {}),
            ...(query.actionId ? { action_id: query.actionId } : {}),
            ...(query.personId ? { person_id: query.personId } : {}),
            ...(query.before ? { before: query.before } : {}),
            ...(query.after ? { after: query.after } : {}),
            ...(query.orderBy ? { orderBy: query.orderBy } : {}),
            ...(query.offset ? { offset: query.offset } : {}),
        },
        query.limit ?? DEFAULT_QUERY_LIMIT
    )
}

export function getPersonsEndpoint(query: PersonsNode): string {
    const params = {
        properties: [...(query.fixedProperties || []), ...(query.properties || [])],
        ...(query.search ? { search: query.search } : {}),
        ...(query.distinctId ? { distinct_id: query.distinctId } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
        ...(query.offset ? { offset: query.offset } : {}),
    }
    if (query.cohort) {
        return api.cohorts.determineListUrl(query.cohort, params)
    }
    return api.persons.determineListUrl(params)
}

interface LegacyInsightQueryParams {
    filters: AnyPartialFilterType
    currentTeamId: number
    methodOptions?: ApiMethodOptions
    refresh?: boolean
}

export function legacyInsightQueryURL({ filters, currentTeamId, refresh }: LegacyInsightQueryParams): string {
    if (isTrendsFilter(filters) || isStickinessFilter(filters) || isLifecycleFilter(filters)) {
        return `api/projects/${currentTeamId}/insights/trend/?${toParams(filterTrendsClientSideParams(filters))}${
            refresh ? '&refresh=true' : ''
        }`
    } else if (isRetentionFilter(filters)) {
        return `api/projects/${currentTeamId}/insights/retention/?${toParams(filters)}${refresh ? '&refresh=true' : ''}`
    } else if (isFunnelsFilter(filters)) {
        return `api/projects/${currentTeamId}/insights/funnel/${refresh ? '?refresh=true' : ''}`
    } else if (isPathsFilter(filters)) {
        return `api/projects/${currentTeamId}/insights/path${refresh ? '&refresh=true' : ''}`
    } else {
        throw new Error(`Unsupported insight type: ${filters.insight}`)
    }
}

export function legacyInsightQueryExportContext({
    filters,
    currentTeamId,
    refresh,
}: LegacyInsightQueryParams): OnlineExportContext {
    const apiUrl = legacyInsightQueryURL({ filters, currentTeamId, refresh })

    if (isTrendsFilter(filters) || isStickinessFilter(filters) || isLifecycleFilter(filters)) {
        return {
            path: apiUrl,
            method: 'GET',
        }
    } else if (isRetentionFilter(filters)) {
        return {
            path: apiUrl,
            method: 'GET',
        }
    } else if (isFunnelsFilter(filters)) {
        return {
            path: apiUrl,
            method: 'POST',
            body: filters,
        }
    } else if (isPathsFilter(filters)) {
        return {
            path: apiUrl,
            method: 'POST',
            body: filters,
        }
    } else {
        throw new Error(`Unsupported insight type: ${filters.insight}`)
    }
}

export async function legacyInsightQuery({
    filters,
    currentTeamId,
    methodOptions,
    refresh,
}: LegacyInsightQueryParams): Promise<[Response, string]> {
    const apiUrl = legacyInsightQueryURL({ filters, currentTeamId, refresh })
    let fetchResponse: Response
    if (isTrendsFilter(filters) || isStickinessFilter(filters) || isLifecycleFilter(filters)) {
        fetchResponse = await api.getResponse(apiUrl, methodOptions)
    } else if (isRetentionFilter(filters)) {
        fetchResponse = await api.getResponse(apiUrl, methodOptions)
    } else if (isFunnelsFilter(filters)) {
        fetchResponse = await api.createResponse(apiUrl, filters, methodOptions)
    } else if (isPathsFilter(filters)) {
        fetchResponse = await api.createResponse(apiUrl, filters, methodOptions)
    } else {
        throw new Error(`Unsupported insight type: ${filters.insight}`)
    }
    return [fetchResponse, apiUrl]
}
