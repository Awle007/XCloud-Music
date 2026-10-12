import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StyledSelect from './StyledSelect.vue'

describe('StyledSelect', () => {
  it('opens its themed menu and emits the selected value', async () => {
    const wrapper = mount(StyledSelect, {
      props: {
        modelValue: 'netease',
        options: [
          { id: 'netease', name: '网易' },
          { id: 'kuwo', name: '酷我' },
          { id: 'qq', name: 'QQ 音乐' },
        ],
        ariaLabel: '搜索音源',
      },
      attachTo: document.body,
    })

    await wrapper.get('.styled-select-trigger').trigger('click')
    expect(wrapper.findAll('.styled-select-menu button')).toHaveLength(3)
    await wrapper.findAll('.styled-select-menu button')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['kuwo']])
    expect(wrapper.emitted('change')).toEqual([['kuwo']])
    expect(wrapper.find('.styled-select-menu').exists()).toBe(false)
    wrapper.unmount()
  })
})
