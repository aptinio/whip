import { ArrowLeft, MessageCircle, RefreshCw } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { readCachedAgentTranscript } from 'react-native-whip-ssh';

import type { AgentChatState } from '../agentChat';
import type { HostProfile } from '../types';
import { hostDisplayName } from '../lib/hostProfiles';
import { agentChatStateFromNative } from '../lib/nativeAgentTranscript';
import { agentChatCache, type SavedAgentChat } from '../services/agentChatCache';
import { useTheme } from '../theme';
import { AgentChatView } from './AgentChatView';
import { Icon } from './ui/icon';
import { Text } from './ui/text';

interface Props {
  visible: boolean;
  hosts: readonly HostProfile[];
}

export function SavedChatsScreen({ visible, hosts }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [chats, setChats] = useState<SavedAgentChat[]>([]);
  const [selected, setSelected] = useState<SavedAgentChat | null>(null);
  const [state, setState] = useState<AgentChatState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadGeneration = useRef(0);

  const close = useCallback(() => {
    loadGeneration.current += 1;
    setSelected(null);
    setState(null);
    setLoading(false);
    setError(null);
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    agentChatCache.listNative()
      .then(setChats)
      .catch(reason => setError(String(reason)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (visible) refresh();
    else {
      // A hidden tab must release the large restored transcript projection.
      loadGeneration.current += 1;
      setSelected(null);
      setState(null);
    }
  }, [refresh, visible]);

  useEffect(() => {
    if (!visible || !selected) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close, selected, visible]);

  const open = (chat: SavedAgentChat) => {
    const generation = ++loadGeneration.current;
    setSelected(chat);
    setState(null);
    setError(null);
    setLoading(true);
    // Let the loading state paint before decoding a large transcript locally.
    setTimeout(() => {
      if (generation !== loadGeneration.current) return;
      agentChatCache.loadNative(chat.key)
        .then(blob => {
          if (generation !== loadGeneration.current) return;
          if (!blob) throw new Error(t('savedChats.missing'));
          const restored = agentChatStateFromNative(readCachedAgentTranscript(
            chat.agent,
            chat.sessionId,
            blob,
          ));
          setState({ ...restored, error: t('savedChats.offline') });
        })
        .catch(reason => {
          if (generation === loadGeneration.current) setError(String(reason));
        })
        .finally(() => {
          if (generation === loadGeneration.current) setLoading(false);
        });
    }, 0);
  };

  const hostName = (namespace: string) => {
    const host = hosts.find(candidate => candidate.id === namespace);
    return host ? hostDisplayName(host) : namespace;
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
        <View className="flex-row items-center gap-3">
          {selected && (
            <Pressable
              accessibilityLabel={t('savedChats.back')}
              onPress={close}
            >
              <Icon as={ArrowLeft} size={24} color={colors.text} />
            </Pressable>
          )}
          <View>
            <Text variant="h3" className="text-left text-xl">
              {selected ? selected.agent === 'codex' ? 'Codex' : 'OpenCode' : t('savedChats.title')}
            </Text>
            {selected && <Text className="text-xs text-muted-foreground">{hostName(selected.namespace)}</Text>}
          </View>
        </View>
        {!selected && (
          <Pressable accessibilityLabel={t('savedChats.refresh')} onPress={refresh}>
            <Icon as={RefreshCw} size={21} color={colors.text} />
          </Pressable>
        )}
      </View>
      {selected ? (
        <View className="flex-1">
          <Text className="px-5 py-2 text-xs text-muted-foreground">
            {t('savedChats.offline')}
          </Text>
          {state ? (
            <AgentChatView
              state={state}
              agent={selected.agent}
              agentStatus="idle"
              contentInsets={{ top: 0, bottom: 135 }}
              latestButtonBottom={145}
              onOpenFile={() => setError(t('savedChats.filesUnavailable'))}
            />
          ) : loading ? (
            <ActivityIndicator className="mt-10" />
          ) : null}
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="px-5 pb-36 pt-3">
          {chats.length === 0 && !loading && (
            <Text className="mt-12 text-center text-muted-foreground">{t('savedChats.empty')}</Text>
          )}
          {chats.map(chat => (
            <Pressable
              key={chat.key}
              accessibilityRole="button"
              onPress={() => open(chat)}
              className="flex-row items-center gap-4 border-b border-border py-4"
            >
              <Icon as={MessageCircle} size={22} color={colors.textSecondary} />
              <View className="flex-1">
                <Text className="font-semibold">
                  {chat.agent === 'codex' ? 'Codex' : 'OpenCode'} · {chat.sessionId.slice(0, 8)}
                </Text>
                <Text className="text-sm text-muted-foreground">{hostName(chat.namespace)}</Text>
              </View>
              <Text className="text-xs text-muted-foreground">
                {new Date(chat.updatedAt).toLocaleDateString()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {error && <Text className="px-5 pb-32 text-sm text-destructive">{error}</Text>}
    </View>
  );
}
