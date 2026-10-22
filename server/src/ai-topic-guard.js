const DOMAIN_PATTERN = /(原粮|粮食|粮仓|车间|设备|机械|电气|维修|检修|维护|保养|点检|巡检|故障|异常|报警|备件|配件|物料|库存|仓储|盘点|入库|出库|领用|库位|货区|货架|安全库存|润滑|更换|拆装|电机|轴承|减速机|输送机|皮带|链条|风机|泵|阀|气缸|空压机|传感器|编码器|接触器|继电器|断路器|变频器|PLC|AGV|AMR|EKK|电缆|螺栓|密封|联轴器)/i;
const HARD_OFF_TOPIC_PATTERN = /(股票|股市|基金|期货|外汇|虚拟币|比特币|彩票|博彩|房价|买房|明星|娱乐|电影|电视剧|游戏|旅游|景点|酒店|菜谱|做饭|购物|穿搭|星座|算命|八字|政治|选举)/i;
const FOLLOW_UP_PATTERN = /^(那|那么|这个|这种|它|刚才|上面|继续|再说|详细|具体|为什么|怎么|如何|怎么办|可以吗|能否|需要吗|还有吗|下一步|请问)/;

const GREETINGS = new Set([
  '你好', '您好', '嗨', '哈喽', '在吗', '早上好', '上午好', '中午好',
  '下午好', '晚上好', '辛苦了', '谢谢', '谢谢你', '再见'
]);

const RESTRICTED_ANSWER = '您好，我目前可以协助：各车间设备故障诊断、维修保养与点检安全；备件库存、库位和库存流水查询；工程资料、故障知识、库存统计、低库存补货清单及数据报表。其他无关问题暂不支持，请换一个上述范围内的问题。';

function normalizeSocialText(value) {
  return String(value || '')
    .trim()
    .replace(/[\s，,。.!！?？~～、]/g, '');
}

function isGreeting(value) {
  const normalized = normalizeSocialText(value);
  if (GREETINGS.has(normalized)) return true;
  return /^(你好|您好)(在吗|辛苦了|谢谢)?$/.test(normalized);
}

function hasDomainTopic(value) {
  return DOMAIN_PATTERN.test(String(value || ''));
}

function isAllowedConversation(messages) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const lastUserIndex = safeMessages.map(item => item?.role).lastIndexOf('user');
  if (lastUserIndex < 0) return false;

  const current = String(safeMessages[lastUserIndex]?.content || '').trim();
  if (!current) return false;
  if (isGreeting(current)) return true;
  if (HARD_OFF_TOPIC_PATTERN.test(current)) return false;
  if (hasDomainTopic(current)) return true;

  const normalizedCurrent = normalizeSocialText(current);
  if (normalizedCurrent.length > 60 || !FOLLOW_UP_PATTERN.test(normalizedCurrent)) return false;

  const previousContext = safeMessages
    .slice(Math.max(0, lastUserIndex - 6), lastUserIndex)
    .map(item => String(item?.content || ''))
    .join('\n');
  return hasDomainTopic(previousContext);
}

module.exports = {
  RESTRICTED_ANSWER,
  hasDomainTopic,
  isAllowedConversation,
  isGreeting
};
