import { Button, Result, Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

export function PageLoading({ text = '加载中...' }: { text?: string }) {
  return (
    <div className="page-loading" role="status">
      <Spin size="small" />
      <span>{text}</span>
    </div>
  );
}

export function PageError({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry: () => void | Promise<void>;
  retrying?: boolean;
}) {
  return (
    <Result
      status="error"
      title="数据加载失败"
      subTitle={message}
      extra={(
        <Button type="primary" icon={<ReloadOutlined />} loading={retrying} onClick={onRetry}>
          重试
        </Button>
      )}
    />
  );
}
