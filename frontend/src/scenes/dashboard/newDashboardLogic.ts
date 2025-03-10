import { actions, connect, isBreakpoint, kea, listeners, path, reducers } from 'kea'
import type { newDashboardLogicType } from './newDashboardLogicType'
import { DashboardRestrictionLevel } from 'lib/constants'
import { DashboardTemplateType, DashboardType, DashboardTemplateVariableType, DashboardTile, JsonType } from '~/types'
import api from 'lib/api'
import { teamLogic } from 'scenes/teamLogic'
import { router } from 'kea-router'
import { urls } from 'scenes/urls'
import { dashboardsModel } from '~/models/dashboardsModel'
import { forms } from 'kea-forms'
import { lemonToast } from 'lib/lemon-ui/lemonToast'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

export interface NewDashboardForm {
    name: string
    description: ''
    show: boolean
    useTemplate: string
    restrictionLevel: DashboardRestrictionLevel
}

const defaultFormValues: NewDashboardForm = {
    name: '',
    description: '',
    show: false,
    useTemplate: '',
    restrictionLevel: DashboardRestrictionLevel.EveryoneInProjectCanEdit,
}

// Currently this is a very generic recursive function incase we want to add template variables to aspects beyond events
export function applyTemplate(obj: DashboardTile | JsonType, variables: DashboardTemplateVariableType[]): JsonType {
    if (typeof obj === 'string') {
        if (obj.startsWith('{') && obj.endsWith('}')) {
            const variableId = obj.substring(1, obj.length - 1)
            const variable = variables.find((variable) => variable.id === variableId)
            if (variable && variable.default) {
                return variable.default
            }
            return obj
        }
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => applyTemplate(item, variables))
    }
    if (typeof obj === 'object' && obj !== null) {
        const newObject: JsonType = {}
        for (const [key, value] of Object.entries(obj)) {
            newObject[key] = applyTemplate(value, variables)
        }
        return newObject
    }
    return obj
}

function makeTilesUsingVariables(tiles: DashboardTile[], variables: DashboardTemplateVariableType[]): JsonType[] {
    return tiles.map((tile: DashboardTile) => applyTemplate(tile, variables))
}

export const newDashboardLogic = kea<newDashboardLogicType>([
    path(['scenes', 'dashboard', 'newDashboardLogic']),
    connect({ logic: [dashboardsModel], values: [featureFlagLogic, ['featureFlags']] }),
    actions({
        setIsLoading: (isLoading: boolean) => ({ isLoading }),
        showNewDashboardModal: true,
        hideNewDashboardModal: true,
        addDashboard: (form: Partial<NewDashboardForm>) => ({ form }),
        createAndGoToDashboard: true,
        setActiveDashboardTemplate: (template: DashboardTemplateType) => ({ template }),
        clearActiveDashboardTemplate: true,
        createDashboardFromTemplate: (template: DashboardTemplateType, variables: DashboardTemplateVariableType[]) => ({
            template,
            variables,
        }),
    }),
    reducers({
        isLoading: [
            false,
            {
                setIsLoading: (_, { isLoading }) => isLoading,
                hideNewDashboardModal: () => false,
                submitNewDashboardSuccess: () => false,
                submitNewDashboardFailure: () => false,
            },
        ],
        newDashboardModalVisible: [
            false,
            {
                showNewDashboardModal: () => true,
                hideNewDashboardModal: () => false,
            },
        ],
        activeDashboardTemplate: [
            null as DashboardTemplateType | null,
            {
                setActiveDashboardTemplate: (_, { template }) => template,
                clearActiveDashboardTemplate: () => null,
            },
        ],
    }),
    forms(({ actions }) => ({
        newDashboard: {
            defaults: defaultFormValues,
            errors: ({ name, restrictionLevel }) => ({
                name: !name ? 'Please give your dashboard a name.' : null,
                restrictionLevel: !restrictionLevel ? 'Restriction level needs to be specified.' : null,
            }),
            submit: async ({ name, description, useTemplate, restrictionLevel, show }, breakpoint) => {
                actions.setIsLoading(true)
                try {
                    const result: DashboardType = await api.create(
                        `api/projects/${teamLogic.values.currentTeamId}/dashboards/`,
                        {
                            name: name,
                            description: description,
                            use_template: useTemplate,
                            restriction_level: restrictionLevel,
                        } as Partial<DashboardType>
                    )
                    actions.hideNewDashboardModal()
                    actions.resetNewDashboard()
                    dashboardsModel.actions.addDashboardSuccess(result)
                    if (show) {
                        breakpoint()
                        router.actions.push(urls.dashboard(result.id))
                    }
                } catch (e: any) {
                    if (!isBreakpoint(e)) {
                        const message = e.code && e.detail ? `${e.code}: ${e.detail}` : e
                        lemonToast.error(`Could not create dashboard: ${message}`)
                    }
                }
                actions.setIsLoading(false)
            },
        },
    })),
    listeners(({ actions }) => ({
        addDashboard: ({ form }) => {
            actions.resetNewDashboard()
            actions.setNewDashboardValues({ ...defaultFormValues, ...form })
            actions.submitNewDashboard()
        },
        showNewDashboardModal: () => {
            actions.resetNewDashboard()
        },
        createAndGoToDashboard: () => {
            actions.setNewDashboardValue('show', true)
            actions.submitNewDashboard()
        },
        hideNewDashboardModal: () => {
            actions.clearActiveDashboardTemplate()
            actions.resetNewDashboard()
        },
        createDashboardFromTemplate: async ({ template, variables }) => {
            const tiles = makeTilesUsingVariables(template.tiles, variables)
            const dashboardJSON = {
                ...template,
                tiles,
            }

            try {
                const result: DashboardType = await api.create(
                    `api/projects/${teamLogic.values.currentTeamId}/dashboards/create_from_template_json`,
                    { template: dashboardJSON }
                )
                actions.hideNewDashboardModal()
                actions.resetNewDashboard()
                dashboardsModel.actions.addDashboardSuccess(result)
                router.actions.push(urls.dashboard(result.id))
            } catch (e: any) {
                if (!isBreakpoint(e)) {
                    const message = e.code && e.detail ? `${e.code}: ${e.detail}` : e
                    lemonToast.error(`Could not create dashboard: ${message}`)
                }
            }
            actions.setIsLoading(false)
        },
    })),
])
