import { AccountSection } from '@/components/settings/AccountSection'
import { AtlasDataOverview } from '@/components/settings/AtlasDataOverview'
import { AtlasEndpointTable } from '@/components/settings/AtlasEndpointTable'
import { AtlasSection } from '@/components/settings/AtlasSection'
import { SheetsSection } from '@/components/settings/SheetsSection'
import { DiscordSection } from '@/components/settings/DiscordSection'
import { NotificationsSection } from '@/components/settings/NotificationsSection'
import { TagsSection } from '@/components/settings/TagsSection'
import { TaskTemplatesSection } from '@/components/settings/TaskTemplatesSection'
import { WorkspaceSection } from '@/components/settings/WorkspaceSection'
import { useAuth } from '@/data/auth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function SettingsPage() {
  useDocumentTitle('Settings')
  const { isPM } = useAuth()

  return (
    <div className="space-y-10 md:space-y-12">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {isPM
            ? 'Manage your workspace, tags, notifications, and profile.'
            : 'Manage your notifications and profile.'}
        </p>
      </header>

      {isPM && <AtlasSection />}
      {isPM && <AtlasDataOverview />}
      {isPM && <AtlasEndpointTable />}
      {isPM && <SheetsSection />}
      {isPM && <WorkspaceSection />}
      {isPM && <TagsSection />}
      {isPM && <TaskTemplatesSection />}
      {isPM && <DiscordSection />}
      <NotificationsSection />
      <AccountSection />
    </div>
  )
}
