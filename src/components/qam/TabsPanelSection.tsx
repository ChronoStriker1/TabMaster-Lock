import { PanelSection, ReorderableList, ReorderableEntry, ButtonItem } from '@decky/ui'
import { VFC, Fragment } from 'react'
import { TabIdEntryType } from './QuickAccessContent'
import { TabActionsButton } from '../other/TabActions'
import { useTabMasterContext } from '../../state/TabMasterContext'
import { TabListLabel } from '../other/TabListLabel'
import { showTabPin, useTabLocks } from '../locks/PinScreen'

interface TabEntryInteractablesProps {
    entry: ReorderableEntry<TabIdEntryType>
}

interface TabsPanelSectionProps {
    isMicroSDeckInstalled: boolean
}

export const TabsPanelSection: VFC<TabsPanelSectionProps> = ({ isMicroSDeckInstalled }) => {
    const { visibleTabsList, hiddenTabsList, tabsMap, tabMasterManager } = useTabMasterContext()
    const locks = useTabLocks(tabMasterManager.locks)

    function TabEntryInteractables({ entry }: TabEntryInteractablesProps) {
        const tabContainer = tabsMap.get(entry.data!.id)!
        return <TabActionsButton {...{ tabContainer, tabMasterManager }} />
    }

    const entries = visibleTabsList.map(tabContainer => {
        return {
            label: <TabListLabel tabContainer={tabContainer} microSDeckDisabled={!isMicroSDeckInstalled} />,
            position: tabContainer.position,
            data: { id: tabContainer.id },
        }
    })

    return tabMasterManager.hasSettingsLoaded ? (
        <>
            <PanelSection title='Tab locks'>
                <ButtonItem layout='below' disabled={!locks.ready || !locks.status.configured} onClick={() => void locks.lock()}>Lock all protected tabs</ButtonItem>
                <ButtonItem layout='below' disabled={!locks.ready || !locks.status.configured}
                    onClick={() => showTabPin(locks, 'change', '', 'Change TabMaster PIN')}>Change PIN</ButtonItem>
                <div style={{ padding: '8px 16px', fontSize: '12px', color: '#b8bcbf' }}>
                    {locks.error || 'Protect a tab from its options menu. Games remain visible in other tabs, Home, and search.'}
                </div>
            </PanelSection>
            <PanelSection title='Tabs'>
                <div className='seperator' />
                <ReorderableList<TabIdEntryType>
                    entries={entries}
                    interactables={TabEntryInteractables}
                    onSave={(entries: ReorderableEntry<TabIdEntryType>[]) => {
                        tabMasterManager.reorderTabs(entries.map(entry => entry.data!.id))
                    }}
                />
            </PanelSection>
            <PanelSection title='Hidden Tabs'>
                <div className='seperator'></div>
                {hiddenTabsList.map(tabContainer => (
                    <div className='hidden-tab-btn'>
                        <ButtonItem
                            label={
                                <TabListLabel tabContainer={tabContainer} microSDeckDisabled={!isMicroSDeckInstalled} />
                            }
                            onClick={() => tabMasterManager.showTab(tabContainer.id)}
                            // @ts-ignore
                            onOKActionDescription='Unhide tab'
                        >
                            Show
                        </ButtonItem>
                    </div>
                ))}
            </PanelSection>
        </>
    ) : (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <img alt='Loading...' src='/images/steam_spinner.png' style={{ width: '150px' }} />
        </div>
    )
}
