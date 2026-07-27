import { useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { DatabaseOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { getErrorMessage } from '../utils/errors';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (values: { email: string; password: string }) => {
    setSubmitting(true);
    setError('');
    try {
      await signIn(values.email, values.password);
    } catch (loginError) {
      setError(getErrorMessage(loginError, '登录失败，请核对账号和密码'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand"><DatabaseOutlined /></div>
        <h1 id="login-title">数据运营服务审量系统</h1>
        <p className="login-subtitle">使用已分配的账号登录系统</p>
        {error && <Alert type="error" showIcon message={error} className="login-alert" />}
        <Form layout="vertical" requiredMark={false} onFinish={submit}>
          <Form.Item name="email" label="登录邮箱" rules={[{ required: true, message: '请输入登录邮箱' }, { type: 'email', message: '请输入有效的邮箱地址' }]}>
            <Input size="large" prefix={<MailOutlined />} autoComplete="username" placeholder="name@example.com" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password size="large" prefix={<LockOutlined />} autoComplete="current-password" placeholder="请输入密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={submitting}>登录</Button>
        </Form>
      </section>
    </main>
  );
}
