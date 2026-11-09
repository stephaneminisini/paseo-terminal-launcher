import type { PluginSurfaceProps, SettingsState } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import { type ComponentType, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import {
  addGroup,
  addScript,
  fieldErrors,
  moveScript,
  removeGroup,
  removeScript,
  updateGroup,
  updateScript,
} from "../shared/editor";
import { type Group, GroupsSchema, groupsSettings, type Script } from "../shared/groups";

type Theme = PluginSurfaceProps["theme"];
type ReadyGroups = Extract<SettingsState<typeof groupsSettings.schema>, { status: "ready" }>;

const MONOSPACE = Platform.OS === "ios" ? "Menlo" : "monospace";

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function SmallButton({ label, theme, onPress, disabled }: {
  label: string;
  theme: Theme;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function ScriptCard(props: {
  group: Group;
  script: Script;
  index: number;
  errors: Record<string, string>;
  theme: Theme;
  disabled: boolean;
  onChange: (next: (groups: Group[]) => Group[]) => void;
}) {
  const { group, script, index, errors, theme, disabled, onChange } = props;
  const key = `${group.id}.script.${script.id}`;
  const last = index === group.scripts.length - 1;
  return (
    <SettingsCard>
      <SettingsInput
        label={`Script ${index + 1}`}
        hint="Also the terminal tab name."
        placeholder="step_transcribe_audio"
        initialValue={script.name}
        error={errors[`${key}.name`]}
        disabled={disabled}
        onChangeText={(name) => onChange((groups) => updateScript(groups, group.id, script.id, { name }))}
      />
      <SettingsRow
        label="Commands"
        hint="Typed into bash one line at a time. Bash stays open when they finish."
        error={errors[`${key}.body`]}
      >
        <TextInput
          accessibilityLabel={`Commands for script ${index + 1}`}
          multiline
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          value={script.body}
          placeholder={"source .venv/bin/activate\npython -m workflow.step_transcribe_audio"}
          placeholderTextColor={theme.colors.foregroundMuted}
          onChangeText={(body) => onChange((groups) => updateScript(groups, group.id, script.id, { body }))}
          style={{
            minHeight: 64,
            padding: 8,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface1,
            color: theme.colors.foreground,
            fontFamily: MONOSPACE,
            fontSize: 12,
            textAlignVertical: "top",
          }}
        />
      </SettingsRow>
      <View style={{ flexDirection: "row", gap: 8, padding: 12, justifyContent: "flex-end" }}>
        <SmallButton
          label="Up"
          theme={theme}
          disabled={disabled || index === 0}
          onPress={() => onChange((groups) => moveScript(groups, group.id, script.id, -1))}
        />
        <SmallButton
          label="Down"
          theme={theme}
          disabled={disabled || last}
          onPress={() => onChange((groups) => moveScript(groups, group.id, script.id, 1))}
        />
        <SmallButton
          label="Remove"
          theme={theme}
          disabled={disabled}
          onPress={() => onChange((groups) => removeScript(groups, group.id, script.id))}
        />
      </View>
    </SettingsCard>
  );
}

function GroupSection(props: {
  group: Group;
  errors: Record<string, string>;
  theme: Theme;
  disabled: boolean;
  onChange: (next: (groups: Group[]) => Group[]) => void;
}) {
  const { group, errors, theme, disabled, onChange } = props;
  return (
    <SettingsSection title={group.name.trim() || "New group"}>
      <SettingsCard>
        <SettingsInput
          label="Group name"
          hint="Run it with /term <name> or from the Command Center."
          placeholder="QAI backend"
          initialValue={group.name}
          error={errors[`${group.id}.name`]}
          disabled={disabled}
          onChangeText={(name) => onChange((groups) => updateGroup(groups, group.id, { name }))}
        />
        <SettingsInput
          label="Folder"
          hint="Where each script starts, on the daemon machine. Empty means the workspace folder."
          placeholder="~/dev/project"
          initialValue={group.cwd}
          error={errors[`${group.id}.cwd`]}
          disabled={disabled}
          onChangeText={(cwd) => onChange((groups) => updateGroup(groups, group.id, { cwd }))}
        />
        <SettingsAction
          label="Delete group"
          actionLabel="Delete"
          disabled={disabled}
          onPress={() => onChange((groups) => removeGroup(groups, group.id))}
        />
      </SettingsCard>
      {group.scripts.map((script, index) => (
        <ScriptCard
          key={script.id}
          group={group}
          script={script}
          index={index}
          errors={errors}
          theme={theme}
          disabled={disabled}
          onChange={onChange}
        />
      ))}
      <SettingsCard>
        <SettingsAction
          label="Add a script to this group"
          error={errors[`${group.id}.scripts`]}
          actionLabel="Add script"
          disabled={disabled}
          onPress={() => onChange((groups) => addScript(groups, group.id, newId))}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

function GroupsForm({ settings, theme, onSaved }: {
  settings: ReadyGroups;
  theme: Theme;
  onSaved: () => void;
}) {
  // Keep the revision from when the form loaded so another client's save becomes a conflict.
  const [revision, setRevision] = useState(settings.revision);
  const [draft, setDraft] = useState<Group[]>(settings.values.groups);
  const errors = useMemo(() => fieldErrors(draft), [draft]);
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(settings.values.groups),
    [draft, settings.values.groups],
  );
  const invalid = Object.keys(errors).length > 0;

  // Adopt a newer revision once the saved values match the draft, as after our own save.
  useEffect(() => {
    if (!dirty) setRevision(settings.revision);
  }, [dirty, settings.revision]);

  async function save() {
    // Save the parsed values (names and folders trimmed) and adopt them, so the form is clean after.
    const parsed = GroupsSchema.safeParse({ groups: draft });
    if (!parsed.success) return;
    setDraft(parsed.data.groups);
    if (await settings.save(parsed.data, revision)) onSaved();
  }

  return (
    <>
      {draft.map((group) => (
        <GroupSection
          key={group.id}
          group={group}
          errors={errors}
          theme={theme}
          disabled={settings.saving}
          onChange={setDraft}
        />
      ))}
      <SettingsSection title="Groups">
        <SettingsCard>
          <SettingsAction
            label="Add a group of scripts"
            actionLabel="Add group"
            disabled={settings.saving}
            onPress={() => setDraft((groups) => addGroup(groups, newId))}
          />
          <SettingsAction
            label={dirty ? (invalid ? "Fix the errors above to save" : "Unsaved changes") : "All changes saved"}
            error={settings.saveError}
            actionLabel="Save"
            disabled={!dirty || invalid || settings.saving}
            onPress={() => void save()}
          />
        </SettingsCard>
        {settings.saveError ? (
          <Text style={{ color: theme.colors.foreground }}>Reload this page to see the latest settings.</Text>
        ) : null}
      </SettingsSection>
    </>
  );
}

/** Settings screen for editing terminal groups; `onSaved` runs after each successful save. */
export function createSettingsScreen(options: { onSaved: () => void }): ComponentType<PluginSurfaceProps> {
  return function SettingsScreen({ theme }: PluginSurfaceProps) {
    const settings = useSettings(groupsSettings);
    const text = { color: theme.colors.foreground };
    if (settings.status === "loading") return <Text style={text}>Loading terminal groups…</Text>;
    if (settings.status === "ready") {
      return <GroupsForm settings={settings} theme={theme} onSaved={options.onSaved} />;
    }
    return (
      <SettingsSection title="Terminal groups">
        <Text style={text}>{settings.error}</Text>
        <SettingsCard>
          <SettingsAction label="Read the settings again" actionLabel="Reload" onPress={() => void settings.reload()} />
          {settings.status === "invalid" ? (
            <SettingsAction
              label="Replace the stored groups with the default QAI backend group"
              actionLabel="Reset"
              onPress={() => void settings.reset()}
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>
    );
  };
}
