'use client'

import type { Category, Profile } from '@nara/api'
import type { ReactElement } from 'react'
import { useState } from 'react'
import TopBarActions from '@/components/TopBarActions'
import { Icon } from '@/components/icons'
import { Card, Empty, Field, Label, PageHeader, SectionTitle, Tag } from '@/components/ui'
import { uid } from '@/lib/id'
import { useStore } from '@/store'

const split = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean)
const join = (items: string[]) => items.join(', ')

export default function ProfilesView(): ReactElement {
  const { profiles, activeProfileId, addProfile, updateProfile, removeProfile, setActiveProfile } = useStore()
  const [editId, setEditId] = useState<string | undefined>(activeProfileId)
  const profile = profiles.find((item) => item.id === editId)

  const create = () => {
    const next: Profile = { id: uid(), name: '새 프로필', categories: [], requirementKeywords: [], defaultKeywords: [] }
    addProfile(next)
    setEditId(next.id)
  }
  const patch = (changes: Partial<Profile>) => { if (profile) updateProfile({ ...profile, ...changes }) }
  const patchCategory = (id: string, changes: Partial<Category>) => {
    if (profile) patch({ categories: profile.categories.map((category) => category.id === id ? { ...category, ...changes } : category) })
  }

  return (
    <>
      <TopBarActions><button type="button" className="btn btn-primary" onClick={create}><Icon name="plus" size={16} />새 프로필</button></TopBarActions>
      <PageHeader title="도메인 프로필" sub="내 사업 분야의 분류 규칙과 요건 키워드를 정의합니다. 활성 프로필은 검색 결과에 자동 적용됩니다." />
      <div className="grid-profiles">
        <Card pad="sm">
          <Label>프로필</Label>
          <div className="profile-list">
            {profiles.map((item) => {
              const selected = item.id === editId
              const active = item.id === activeProfileId
              return <div key={item.id} className={`profile-row${selected ? ' is-selected' : ''}`}>
                <button type="button" className="profile-select" onClick={() => setEditId(item.id)}>{item.name}</button>
                {active ? <Tag tone="blue">활성</Tag> : <button type="button" className="btn-link profile-activate" onClick={() => setActiveProfile(item.id)}>활성화</button>}
              </div>
            })}
          </div>
          <div className="divider profile-divider" />
          <div className="muted profile-help">규칙은 사업명과 기관명에 대해 대소문자 구분 없이 부분 일치합니다. 포함 단어 중 하나라도 맞고 제외 단어가 없으면 분류됩니다. 결과 화면에서 분류별 필터링이 가능합니다.</div>
        </Card>
        {profile ? <Card>
          <SectionTitle right={<button type="button" className="btn-link" onClick={() => { if (confirm('프로필을 삭제할까요?')) { removeProfile(profile.id); setEditId(undefined) } }}>삭제</button>}>프로필 설정</SectionTitle>
          <div className="grid-2">
            <Field label="프로필 이름"><input className="input" value={profile.name} onChange={(event) => patch({ name: event.target.value })} /></Field>
            <Field label="설명"><input className="input" value={profile.description ?? ''} onChange={(event) => patch({ description: event.target.value })} /></Field>
          </div>
          <Field label="기본 검색어"><input className="input" value={join(profile.defaultKeywords)} onChange={(event) => patch({ defaultKeywords: split(event.target.value) })} /></Field>
          <Field label="요건 키워드 · 사업명에 있으면 강조"><input className="input" value={join(profile.requirementKeywords)} onChange={(event) => patch({ requirementKeywords: split(event.target.value) })} /></Field>
          <div className="row profile-category-head"><strong className="section-title">분류 카테고리 <span className="mono">{profile.categories.length}</span></strong><span className="spacer" /><button type="button" className="btn btn-ghost btn-sm" onClick={() => patch({ categories: [...profile.categories, { id: uid(), name: '새 분류', color: '#888888', include: [], exclude: [] }] })}><Icon name="plus" size={14} />분류 추가</button></div>
          <div className="dtable category-table">
            <div className="dtable-head cols-categories"><span /><span>이름</span><span>포함 단어</span><span>제외 단어</span><span /></div>
            {profile.categories.map((category) => <div key={category.id} className="dtable-row cols-categories category-row">
              <input className="category-color" type="color" value={category.color} aria-label={`${category.name} 색상`} onChange={(event) => patchCategory(category.id, { color: event.target.value })} />
              <input className="input" value={category.name} aria-label={`${category.name} 이름`} onChange={(event) => patchCategory(category.id, { name: event.target.value })} />
              <input className="input mono" defaultValue={join(category.include)} aria-label={`${category.name} 포함 단어`} onBlur={(event) => patchCategory(category.id, { include: split(event.target.value) })} />
              <input className="input faint" defaultValue={join(category.exclude)} placeholder="없음" aria-label={`${category.name} 제외 단어`} onBlur={(event) => patchCategory(category.id, { exclude: split(event.target.value) })} />
              <button type="button" className="btn btn-icon btn-sm" aria-label="분류 삭제" onClick={() => patch({ categories: profile.categories.filter((item) => item.id !== category.id) })}><Icon name="x" size={15} /></button>
            </div>)}
          </div>
        </Card> : <Card><Empty>왼쪽에서 프로필을 선택하거나 새로 만드세요.</Empty></Card>}
      </div>
    </>
  )
}
