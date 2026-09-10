import { definePlugin, RoutePatch, routerHook } from '@decky/api'
import { TbLayoutNavbarExpand } from 'react-icons/tb'
import { PluginController } from './lib/controllers/PluginController'
import { TabMasterContextProvider } from './state/TabMasterContext'
import { TabMasterManager } from './state/TabMasterManager'
import { patchLibrary } from './patches/LibraryPatch'
import { patchSettings } from './patches/SettingsPatch'
import { MicroSDeck } from '@cebbinghaus/microsdeck'
import { MicroSDeckInterop } from './lib/controllers/MicroSDeckInterop'
import { QuickAccessContent, QuickAccessTitleView } from './components/qam/QuickAccessContent'
import { DocsRouter } from './components/docs/DocsRouter'
import { Fragment } from 'react'

declare global {
    let DeckyPluginLoader: DeckyLoader
    var MicroSDeck: MicroSDeck | undefined
    let collectionStore: CollectionStore
    let appStore: AppStore
    let loginStore: LoginStore
    let friendStore: FriendStore
    //* This casing is correct, idk why it doesn't match the others.
    let securitystore: SecurityStore
    let settingsStore: SettingsStore
    let installFolderStore: InstallFolderStore
    let appAchievementProgressCache: AppAchievementProgressCache
    let LocalizationManager: LocalizationManager
}

export default definePlugin(() => {
    let libraryPatch: RoutePatch | undefined
    let settingsPatch: RoutePatch | undefined
    let mounted = true

    const tabMasterManager = new TabMasterManager()
    PluginController.setup(tabMasterManager)

    const loginUnregisterer = PluginController.initOnLogin(async () => {
        await MicroSDeckInterop.waitForLoad()
        if (!mounted) return
        await tabMasterManager.loadTabs()
        if (!mounted) return
        // The same manager survives account changes; don't stack route patches.
        if (!libraryPatch) libraryPatch = patchLibrary(tabMasterManager)
        if (!settingsPatch) settingsPatch = patchSettings(tabMasterManager)
    })

    routerHook.addRoute('/tab-master-docs', () => (
        <TabMasterContextProvider tabMasterManager={tabMasterManager}>
            <DocsRouter />
        </TabMasterContextProvider>
    ))
    return {
        name: 'TabMaster Lock',
        title: <></>,
        titleView: <QuickAccessTitleView title='TabMaster Lock' tabMasterManager={tabMasterManager} />,
        content: (
            <TabMasterContextProvider tabMasterManager={tabMasterManager}>
                <QuickAccessContent />
            </TabMasterContextProvider>
        ),
        icon: <TbLayoutNavbarExpand />,
        onDismount: () => {
            mounted = false
            if (libraryPatch) routerHook.removePatch('/library', libraryPatch)
            if (settingsPatch) routerHook.removePatch('/settings', settingsPatch)
            routerHook.removeRoute('/tab-master-docs')

            loginUnregisterer.unregister()
            PluginController.dismount()
        },
    }
})
